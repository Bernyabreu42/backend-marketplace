import type { Request, Response, NextFunction } from "express";

import { ApiResponse } from "../../core/responses/ApiResponse";
import prisma from "../../database/prisma";
import bcrypt from "bcrypt";
import { RolesEnum } from "../../core/enums";
import {
  generateAccessToken,
  generateEmailToken,
  generatePasswordResetToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyEmailToken,
  verifyPasswordResetToken,
  verifyRefreshToken,
} from "../../utils/jwt";
import { mailService } from "../../core/services/mailService";
import { createSession, deleteSession } from "../sessions/sessions.controller";

interface VerifyToken {
  id: string;
  role: string;
  email: string;
}

const isProd = process.env.NODE_ENV === "production";
const accessCookie = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  maxAge: 15 * 60 * 1000, // 15m
  path: "/",
} as const;
const refreshCookie = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7d
  path: "/",
} as const;

const getUserIdFromPayload = (p: any): string | undefined =>
  p && typeof p === "object" ? p.sub ?? p.id : undefined;

export const verifyMe = async (req: Request, res: Response) => {
  const accessToken = req.cookies?.accessToken;
  const refreshToken = req.cookies?.refreshToken;

  try {
    // 1) Access token válido → devolver user desde DB
    if (accessToken) {
      try {
        const payload = verifyAccessToken(accessToken) as any;
        const userId = getUserIdFromPayload(payload);
        if (userId) {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
              id: true,
              email: true,
              username: true,
              status: true,
              emailVerified: true,
              isOnline: true,
              lastLogin: true,
              lastSeenAt: true,
              profileImage: true,
              role: true,
            },
          });
          if (user && user.status === "active" && user.emailVerified) {
            res.status(200).json(
              ApiResponse.success({
                message: "Usuario autenticado",
                data: user,
              })
            );
            return;
          }
        }
      } catch {
        /* expiró o es inválido → intentamos refresh */
      }
    }

    // 2) Refresh token → validar sesión y rotar
    if (!refreshToken) {
      res
        .status(401)
        .json(ApiResponse.error({ message: "Token inválido o expirado" }));
      return;
    }

    // 2.1 validar firma/exp del refresh
    let rtPayload: any;
    try {
      rtPayload = verifyRefreshToken(refreshToken);
    } catch {
      res.status(401).json(ApiResponse.error({ message: "Refresh inválido" }));
      return;
    }
    const userId = getUserIdFromPayload(rtPayload);
    if (!userId) {
      res.status(401).json(ApiResponse.error({ message: "Payload inválido" }));
      return;
    }

    // 2.2 sesión en DB
    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });
    if (
      !session ||
      session.revoked ||
      session.expiresAt <= new Date() ||
      !session.user ||
      session.user.status !== "active" ||
      !session.user.emailVerified
    ) {
      res.status(401).json(ApiResponse.error({ message: "Sesión inválida" }));
      return;
    }

    // 2.3 rotar: revocar viejo + crear nuevo (sesión nueva)
    const newRefreshToken = generateRefreshToken({ id: session.userId });
    const newAccessToken = generateAccessToken({ id: session.userId });
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.session.update({
        where: { id: session.id },
        data: { revoked: true, revokedAt: new Date() },
      }),
      prisma.session.create({
        data: {
          userId: session.userId,
          refreshToken: newRefreshToken,
          expiresAt: newExpiresAt,
          userAgent: req.headers["user-agent"] ?? undefined,
          ip: req.ip,
        },
      }),
      prisma.user.update({
        where: { id: session.userId },
        data: { isOnline: true, lastSeenAt: new Date() },
      }),
    ]);

    // 2.4 setear cookies nuevas
    res
      .cookie("accessToken", newAccessToken, accessCookie)
      .cookie("refreshToken", newRefreshToken, refreshCookie)
      .status(200)
      .json(
        ApiResponse.success({
          message: "Usuario autenticado (renovado)",
          data: {
            id: session.user.id,
            email: session.user.email,
            username: session.user.username,
            status: session.user.status,
            emailVerified: session.user.emailVerified,
          },
        })
      );
  } catch (err: any) {
    res.status(403).json(
      ApiResponse.error({
        message: "Error de autenticación",
        error: err?.message,
      })
    );
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  const rt = req.cookies?.refreshToken;
  if (!rt) {
    res.status(401).json(ApiResponse.error({ message: "Falta refresh token" }));
    return;
  }

  try {
    // 1) Verificar firma/exp del JWT refresh
    const payload: any = verifyRefreshToken(rt);
    const userId = payload?.sub ?? payload?.id;
    if (!userId) {
      res.status(401).json(ApiResponse.error({ message: "Refresh inválido" }));
      return;
    }

    // 2) Validar sesión en DB (revoked/expirada) + estado de cuenta
    const session = await prisma.session.findUnique({
      where: { refreshToken: rt },
      include: { user: true },
    });
    if (
      !session ||
      session.revoked ||
      session.expiresAt <= new Date() ||
      !session.user ||
      session.user.status !== "active" ||
      !session.user.emailVerified
    ) {
      res
        .status(401)
        .json(ApiResponse.error({ message: "Sesión inválida o expirada" }));
      return;
    }

    // 3) Rotar tokens (revoco vieja y creo nueva sesión)
    const newRefreshToken = generateRefreshToken({ id: session.userId });
    const newAccessToken = generateAccessToken({ id: session.userId });
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.session.update({
        where: { id: session.id },
        data: { revoked: true, revokedAt: new Date() },
      }),
      prisma.session.create({
        data: {
          userId: session.userId,
          refreshToken: newRefreshToken,
          expiresAt: newExpiresAt,
          userAgent: req.headers["user-agent"] ?? undefined,
          ip: req.ip,
        },
      }),
      prisma.user.update({
        where: { id: session.userId },
        data: { isOnline: true, lastSeenAt: new Date() },
      }),
    ]);

    // 4) Setear cookies nuevas
    res
      .cookie("accessToken", newAccessToken, accessCookie)
      .cookie("refreshToken", newRefreshToken, refreshCookie)
      .status(200)
      .json(
        ApiResponse.success({
          message: "Usuario autenticado (renovado)",
          data: {
            id: session.user.id,
            email: session.user.email,
            username: session.user.username,
            status: session.user.status,
            emailVerified: session.user.emailVerified,
          },
        })
      );
  } catch (e: any) {
    res
      .status(401)
      .json(
        ApiResponse.error({ message: "Refresh inválido", error: e?.message })
      );
  }
};

export const loginUser = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      res
        .status(400)
        .json(
          ApiResponse.error({ message: "Email y password son requeridos" })
        );
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user) {
      res
        .status(401)
        .json(ApiResponse.error({ message: "Credenciales inválidas" }));
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
        .status(401)
        .json(ApiResponse.error({ message: "Usuario no verificado" }));
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res
        .status(401)
        .json(ApiResponse.error({ message: "Credenciales inválidas" }));
      return;
    }

    // crea sesión (refresh) y access
    const refreshToken = await createSession(user.id);
    const accessToken = generateAccessToken({ id: user.id });

    // presencia
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date(), lastSeenAt: new Date(), isOnline: true },
    });

    res
      .cookie("accessToken", accessToken, accessCookie)
      .cookie("refreshToken", refreshToken, refreshCookie)
      .json(
        ApiResponse.success({
          message: "Inicio de sesión exitoso",
          data: { id: user.id, email: user.email, role: user.role },
        })
      );
  } catch (error) {
    res
      .status(500)
      .json(ApiResponse.error({ message: "Error al iniciar sesión", error }));
  }
};

export const registerAccount = async (req: Request, res: Response) => {
  const { email, password: passwordBody, username } = req.body;

  try {
    const emailParse = email?.trim().toLowerCase();
    if (!emailParse || !passwordBody) {
      res
        .status(400)
        .json(
          ApiResponse.error({ message: "Email y password son requeridos" })
        );
      return;
    }

    const userExists = await prisma.user.findUnique({
      where: { email: emailParse },
    });
    if (userExists) {
      res.status(409).json(ApiResponse.error({ message: "Usuario ya existe" }));
      return;
    }

    const hashedPassword = await bcrypt.hash(passwordBody, 12);

    const user = await prisma.user.create({
      data: {
        username,
        email: emailParse,
        password: hashedPassword,
        role: RolesEnum.BUYER,
        emailVerified: false,
        status: "active",
      },
    });

    // token de verificación dedicado (24h)
    const verifyToken = generateEmailToken({ id: user.id });

    await mailService({
      to: emailParse,
      subject: "Verifica tu cuenta en Health Friend SRL",
      template: "verification",
      data: {
        name: username || emailParse.split("@")[0],
        verificationUrl: `${process.env.CLIENT_URL}/auth/verified-account?token=${verifyToken}`,
      },
    });

    const { password, ...userWithoutPassword } = user;
    res.status(201).json(
      ApiResponse.success({
        data: userWithoutPassword,
        message: "Usuario creado",
      })
    );
  } catch (error) {
    res
      .status(500)
      .json(ApiResponse.error({ message: "Error al crear usuario" }));
  }
};

export const verifyAccount = async (req: Request, res: Response) => {
  const token = req.query.accessToken as string; // cambia el link a ?token=...

  if (!token) {
    res.status(400).json(ApiResponse.error({ message: "Falta token" }));
    return;
  }

  try {
    const { id } = verifyEmailToken(token) as { id: string }; // valida firma + propósito + exp

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Usuario no encontrado" }));
      return;
    }

    if (user.emailVerified) {
      res
        .status(200)
        .json(ApiResponse.success({ message: "Cuenta ya verificada" }));
      return;
    }

    await prisma.user.update({
      where: { id },
      data: { emailVerified: true },
    });

    res.json(ApiResponse.success({ message: "Cuenta verificada" }));
  } catch {
    res
      .status(400)
      .json(ApiResponse.error({ message: "Token inválido o expirado" }));
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  const email = (req.body?.email ?? "").trim().toLowerCase();

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    // Evita enumeración de usuarios: responde 200 siempre
    if (!user) {
      res.json(
        ApiResponse.success({
          message:
            "Hemos procesado tu solicitud. Si corresponde, recibirás en los próximos minutos un enlace para restablecer tu contraseña. Revisa también tu carpeta de spam",
        })
      );
      return;
    }

    if (user.status !== "active") {
      res.status(403).json(
        ApiResponse.error({
          message: "Cuenta deshabilitada. Contacta soporte.",
        })
      );
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json(
        ApiResponse.error({
          message:
            "Debes verificar tu correo antes de restablecer la contraseña.",
        })
      );
      return;
    }

    const token = generatePasswordResetToken({ id: user.id });
    const resetLink = `${process.env.CLIENT_URL}/auth/reset-password?token=${token}`;

    await mailService({
      to: email,
      subject: "Restablecer contraseña en Health Friend SRL",
      template: "forgot-password",
      data: {
        name: user.username || email.split("@")[0],
        resetPasswordUrl: resetLink,
      },
    });

    res.json(
      ApiResponse.success({
        message:
          "Hemos procesado tu solicitud. Si corresponde, recibirás en los próximos minutos un enlace para restablecer tu contraseña. Revisa también tu carpeta de spam",
      })
    );
  } catch (error: any) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al enviar el correo de recuperación",
        error: error?.message ?? String(error),
      })
    );
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  const { token, password } = req.body;
  if (!token || !password) {
    res
      .status(400)
      .json(ApiResponse.error({ message: "Faltan datos requeridos" }));
    return;
  }

  try {
    // ✅ Token dedicado para reset (30m), NO el access
    const { id } = verifyPasswordResetToken(token) as { id: string };

    const user = await prisma.user.findUnique({ where: { id } });
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

    // (opcional) políticas de password
    if (password.length < 8) {
      res.status(400).json(
        ApiResponse.error({
          message: "La contraseña debe tener al menos 8 caracteres",
        })
      );
      return;
    }

    const hashed = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({ where: { id }, data: { password: hashed } }),
      prisma.session.updateMany({
        where: { userId: id, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      }),
    ]);

    res.json(ApiResponse.success({ message: "Contraseña actualizada" }));
  } catch (e) {
    res
      .status(400)
      .json(ApiResponse.error({ message: "Token inválido o expirado" }));
  }
};

export const logoutUser = async (req: Request, res: Response) => {
  const rt = req.cookies?.refreshToken;
  const at = req.cookies?.accessToken;

  try {
    if (rt) {
      // Revoca SOLO la sesión actual y ajusta presencia dentro de deleteSession
      await deleteSession(rt);
    } else if (at) {
      // (Opcional) logout global si no hay refresh: revoca todas las sesiones del usuario
      try {
        const { id } = verifyAccessToken(at) as { id: string };
        await prisma.$transaction([
          prisma.session.updateMany({
            where: { userId: id, revoked: false },
            data: { revoked: true, revokedAt: new Date() },
          }),
          prisma.user.update({
            where: { id },
            data: { isOnline: false, lastSeenAt: new Date() },
          }),
        ]);
      } catch {
        /* token inválido ⇒ limpiamos cookies igual */
      }
    }

    res
      .clearCookie("accessToken", accessCookie)
      .clearCookie("refreshToken", refreshCookie)
      .status(200)
      .json(ApiResponse.success({ message: "Sesión cerrada correctamente" }));
  } catch (error) {
    res
      .status(500)
      .json(ApiResponse.error({ message: "Error al cerrar sesión", error }));
  }
};
