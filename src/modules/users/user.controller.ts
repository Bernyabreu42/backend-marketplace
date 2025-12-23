import type { Request, Response } from "express";
import prisma from "../../database/prisma";
import { accessTokenCookie, refreshTokenCookie } from "../../config/cookies";
import { env } from "../../config/env";
import { ApiResponse } from "../../core/responses/ApiResponse";
import bcrypt from "bcrypt";

import { ApiPaginatedResponse } from "../../core/responses/ApiPaginatedResponse";
import { paginate } from "../../utils/pagination";

import { createSession } from "../sessions/sessions.controller";
import {
  generateAccessToken,
  generateEmailToken,
  verifyAccessToken,
} from "../../utils/jwt";
import { userPublicSelect } from "./SchemaPublic";
import { bodySchema, buildDisplayName, validateCreateUser } from "./validator";
import { IdSchema } from "../products/validator";
import { safeDelete } from "../../utils";
import { StatusStore, UserStatus } from "@prisma/client";
import { RolesEnum } from "../../core/enums";
import { mailService } from "../../core/services/mailService";

const extractClientIp = (req: Request): string | undefined => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0];
  }
  return req.ip;
};

const extractUserAgent = (req: Request): string | undefined => {
  const header = req.headers["user-agent"];
  if (Array.isArray(header)) return header[0];
  return header ?? undefined;
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const result = await paginate({
      model: prisma.user,
      query: req.query,
      where: {
        isDeleted: false,
      },
      select: userPublicSelect,
    });
    res.json(ApiPaginatedResponse.success(result));
  } catch (error) {
    res
      .status(500)
      .json(ApiResponse.error({ message: "Error al obtener usuarios", error }));
  }
};

export const getOnlyUser = async (req: Request, res: Response) => {
  const { id } = req.params;

  const parsed = IdSchema.safeParse(id);

  if (!parsed.success) {
    res.status(400).json(ApiResponse.error({ message: "ID inválido" }));
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      include: { store: true },
    });

    if (!user) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Usuario no encontrado" }));
      return;
    }

    const { password, ...userWithoutPassword } = user;

    res.json(
      ApiResponse.success({
        data: userWithoutPassword,
        message: "Usuario obtenido",
      })
    );
  } catch (error) {
    res
      .status(500)
      .json(ApiResponse.error({ message: "Error al obtener usuarios" }));
  }
};

export const createUser = async (req: Request, res: Response) => {
  // 1) Validar y normalizar
  const v = validateCreateUser(req.body);

  if (!v.success) {
    res.status(400).json(
      ApiResponse.error({
        message: "Error en el formato de datos",
        error: v.errors,
      })
    );
    return;
  }

  const data = v.data;
  const emailParse = data.email?.trim().toLowerCase();

  try {
    // 2) Unicidad por email
    const exists = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (exists) {
      res.status(409).json(ApiResponse.error({ message: "Usuario ya existe" }));
      return;
    }

    // 3) Hash
    const hashed = await bcrypt.hash(data.password, 12);

    // 4) displayName derivado si falta
    const finalDisplayName = buildDisplayName(data);

    // 5) Crear
    const user = await prisma.user.create({
      data: {
        email: emailParse,
        password: hashed,
        role: data.role,
        status: UserStatus.active,
        emailVerified: false,
        username: data.username ?? null,
        phone: data.phone ?? null,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        displayName: finalDisplayName,
      },
      select: userPublicSelect,
    });

    // token de verificación dedicado (24h)
    const verifyToken = generateEmailToken({ id: user.id });

    await mailService({
      to: emailParse,
      subject: "Verifica tu cuenta en Health Friend SRL",
      template: "verification",
      data: {
        name: user.username || emailParse.split("@")[0],
        verificationUrl: `${env.CLIENT_URL}/auth/verified-account?token=${verifyToken}`,
      },
    });

    res
      .status(201)
      .json(ApiResponse.success({ data: user, message: "Usuario creado" }));
  } catch (e: any) {
    if (e?.code === "P2002") {
      res.status(409).json(ApiResponse.error({ message: "Usuario ya existe" }));
      return;
    }

    res.status(500).json(
      ApiResponse.error({
        message: "Error al crear usuario",
        error: e?.message ?? String(e),
      })
    );
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  const { id } = req.params;

  const parsed = IdSchema.safeParse(id);

  if (!parsed.success) {
    res.status(400).json(ApiResponse.error({ message: "ID inválido" }));
    return;
  }

  const requester = (req as any).user;
  const requesterId = requester?.id ?? null;
  const requesterRole = requester?.role as RolesEnum | undefined;
  const isSelfDelete = requesterId === id;

  if (!isSelfDelete && requesterRole !== RolesEnum.ADMIN) {
    res.status(403).json(
      ApiResponse.error({
        message: "No tienes permisos para eliminar este usuario",
      })
    );
    return;
  }
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Usuario no encontrado" }));
      return;
    }
    // (opcional) evita borrar al último admin
    if (user.role === RolesEnum.ADMIN) {
      const admins = await prisma.user.count({
        where: { role: RolesEnum.ADMIN, status: "active" },
      });

      if (admins <= 1) {
        res
          .status(409)
          .json(
            ApiResponse.error({ message: "No puedes eliminar al único admin" })
          );
        return;
      }
    }

    const now = new Date();
    const anonymizedEmail = `deleted+${id}@local.invalid`;

    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: {
          status: UserStatus.disabled,
          isOnline: false,
          emailVerified: false,
          isDeleted: true,
          deletedAt: now,
          deletedBy: requesterId ?? null,
          email: anonymizedEmail,
          username: null,
          phone: null,
          firstName: null,
          lastName: null,
          displayName: `Deleted User`,
          profileImage: null,
          lastSeenAt: now,
        },
      }),
      prisma.store.updateMany({
        where: { ownerId: id },
        data: {
          status: StatusStore.pending,
          isFeatured: false,
          featuredUntil: null,
        },
      }),
      prisma.session.updateMany({
        where: { userId: id, revoked: false },
        data: { revoked: true, revokedAt: now },
      }),
    ]);

    res.json(ApiResponse.success({ message: "Usuario deshabilitado" }));
  } catch (error: any) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al eliminar usuario",
        error: error?.message ?? String(error),
      })
    );
  }
};

export const updateUser = async (req: Request, res: Response) => {
  const { id } = req.params;

  const parsed = IdSchema.safeParse(id);

  if (!parsed.success) {
    res.status(400).json(ApiResponse.error({ message: "ID inválido" }));
    return;
  }

  // Quien hace la petición (del middleware)
  const actor: any = (req as any).user || {};
  const isAdmin = actor?.role === "admin";

  // 1) Whitelist de campos editables por el usuario
  const allowed: Array<keyof any> = [
    "username",
    "phone",
    "firstName",
    "lastName",
    "displayName",
    "profileImage",
  ];
  const dataToUpdate: any = {};

  for (const k of allowed) {
    if (k in req.body) dataToUpdate[k] = req.body[k];
  }

  if (dataToUpdate.username) {
    dataToUpdate.username = String(dataToUpdate.username).trim().toLowerCase();
  }

  // 2) Campos sensibles: NO aquí
  if ("password" in req.body) {
    res.status(400).json(
      ApiResponse.error({
        message: "No puedes cambiar contraseña la contraseña por aquí",
      })
    );
    return;
  }

  if ("email" in req.body) {
    res.status(400).json(
      ApiResponse.error({
        message: "Cambio de email requiere flujo de verificación",
      })
    );
    return;
  }

  // 3) Admin-only: role/status
  if ("role" in req.body || "status" in req.body) {
    if (!isAdmin) {
      res.status(403).json(
        ApiResponse.error({
          message: "No autorizado para cambiar role/status",
        })
      );
      return;
    }

    if ("role" in req.body) dataToUpdate.role = req.body.role;
    if ("status" in req.body) dataToUpdate.status = req.body.status; // "active" | "disabled"
  }

  try {
    // Unicidades: username (si lo cambian)
    if (dataToUpdate.username) {
      const clash = await prisma.user.findFirst({
        where: { username: dataToUpdate.username, id: { not: id } },
        select: { id: true },
      });
      if (clash) {
        res
          .status(409)
          .json(ApiResponse.error({ message: "Username ya en uso" }));
        return;
      }
    }

    // Validaciones especiales para cambios de rol
    if (isAdmin && dataToUpdate.role) {
      const currentUser = await prisma.user.findUnique({
        where: { id },
        select: { role: true },
      });

      if (!currentUser) {
        res
          .status(404)
          .json(ApiResponse.error({ message: "Usuario no encontrado" }));
        return;
      }

      const currentRole = currentUser.role as RolesEnum;
      const nextRole = dataToUpdate.role as RolesEnum;

      const roleTransitions: Record<RolesEnum, RolesEnum[]> = {
        [RolesEnum.BUYER]: [
          RolesEnum.BUYER,
          RolesEnum.SUPPORT,
          RolesEnum.ADMIN,
        ],
        [RolesEnum.SUPPORT]: [
          RolesEnum.SUPPORT,
          RolesEnum.ADMIN,
          RolesEnum.BUYER,
        ],
        [RolesEnum.ADMIN]: [
          RolesEnum.ADMIN,
          RolesEnum.SUPPORT,
          RolesEnum.BUYER,
        ],
        [RolesEnum.SELLER]: [RolesEnum.SELLER],
      };

      if (!roleTransitions[currentRole].includes(nextRole)) {
        res.status(400).json(
          ApiResponse.error({
            message: "Transición de rol no permitida",
          })
        );
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: dataToUpdate,
      select: userPublicSelect,
    });

    res.json(
      ApiResponse.success({ data: updated, message: "Usuario actualizado" })
    );
  } catch (e: any) {
    if (e?.code === "P2025") {
      // Record not found
      res
        .status(404)
        .json(ApiResponse.error({ message: "Usuario no encontrado" }));
      return;
    }
    if (e?.code === "P2002") {
      // Unique constraint (email/username/etc.)
      res
        .status(409)
        .json(ApiResponse.error({ message: "Valor duplicado en campo único" }));
      return;
    }
    res.status(500).json(
      ApiResponse.error({
        message: "Error al actualizar usuario",
        error: e?.message ?? String(e),
      })
    );
  }
};

export const changePassword = async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const accessToken = req.cookies?.accessToken;

  // 1) Validaciones rápidas
  if (!currentPassword || !newPassword) {
    res
      .status(400)
      .json(ApiResponse.error({ message: "Faltan datos requeridos" }));
    return;
  }

  if (typeof newPassword !== "string" || newPassword.trim().length < 8) {
    res.status(400).json(
      ApiResponse.error({
        message: "La contraseña debe tener al menos 8 caracteres",
      })
    );
    return;
  }

  if (currentPassword === newPassword) {
    res.status(400).json(
      ApiResponse.error({
        message: "La nueva contraseña no puede ser igual a la actual",
      })
    );
    return;
  }

  if (!accessToken) {
    res.status(401).json(ApiResponse.error({ message: "No autenticado" }));
    return;
  }

  try {
    // 2) userId: toma del middleware si existe; fallback al token
    const userIdFromReq = (req as any)?.user?.id as string | undefined;
    const userId =
      userIdFromReq ?? (verifyAccessToken(accessToken) as { id?: string })?.id;

    if (!userId) {
      res.status(401).json(ApiResponse.error({ message: "Token inválido" }));
      return;
    }

    // 3) Cargar usuario
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Usuario no encontrado" }));
      return;
    }

    if (user.status !== "active") {
      res
        .status(403)
        .json(ApiResponse.error({ message: "Cuenta deshabilitada" }));
      return;
    }

    if (!user.emailVerified) {
      res
        .status(403)
        .json(ApiResponse.error({ message: "Debes verificar tu correo" }));
      return;
    }
    // 4) Verificar contraseña actual
    const ok = await bcrypt.compare(currentPassword, user.password);

    if (!ok) {
      res
        .status(401)
        .json(ApiResponse.error({ message: "Contraseña actual incorrecta" }));
      return;
    }
    // 5) Evitar reuso (por si cambian validaciones arriba)
    const sameAsOld = await bcrypt.compare(newPassword, user.password);

    if (sameAsOld) {
      res.status(400).json(
        ApiResponse.error({
          message: "La nueva contraseña no puede ser igual a la anterior",
        })
      );
      return;
    }

    const hashed = await bcrypt.hash(newPassword.trim(), 12);

    // 6) Transacción: actualizar pass + revocar sesiones
    const now = new Date();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { password: hashed, isOnline: true, lastSeenAt: now },
      }),
      prisma.session.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true, revokedAt: now },
      }),
    ]);

    // 7) Emitir nuevos tokens
    const newRefreshToken = await createSession(userId, {
      userAgent: extractUserAgent(req),
      ip: extractClientIp(req),
    });
    const newAccessToken = generateAccessToken({ id: userId });

    res
      .cookie("accessToken", newAccessToken, accessTokenCookie)
      .cookie("refreshToken", newRefreshToken, refreshTokenCookie)
      .json(ApiResponse.success({ message: "Contraseña actualizada" }));
  } catch (err: any) {
    // Diferenciar errores JWT
    res.status(500).json(
      ApiResponse.error({
        error: err?.message,
      })
    );
  }
};

export const uploadProfileImage = async (req: Request, res: Response) => {
  // 1) auth
  if (!req.user?.id) {
    res.status(401).json(ApiResponse.error({ message: "No autenticado" }));
    return;
  }

  // 2) validar body
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(
      ApiResponse.error({
        message: "Falta o es inválida la URL de imagen",
        error: parsed.error.flatten(),
      })
    );
    return;
  }
  const { profileImage } = parsed.data;

  try {
    // 3) cargar usuario (y vieja imagen)
    const existing = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, profileImage: true },
    });

    if (!existing) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Usuario no encontrado" }));
      return;
    }

    // 4) si es la misma imagen, no hagas nada
    if (existing.profileImage && existing.profileImage === profileImage) {
      res.json(ApiResponse.success({ message: "Imagen sin cambios" }));
      return;
    }

    // 5) actualizar primero…
    await prisma.user.update({
      where: { id: req.user.id },
      data: { profileImage },
    });

    // …y luego borrar en segundo plano la anterior (si aplica)
    if (existing.profileImage) await safeDelete(existing.profileImage);

    res.json(ApiResponse.success({ message: "Imagen de perfil actualizada" }));
  } catch (error: any) {
    // console.error(
    //   "Error al actualizar imagen de perfil:",
    //   error?.message || error
    // );
    res.status(500).json(
      ApiResponse.error({
        message: "Error inesperado",
        error: error?.message,
      })
    );
  }
};
