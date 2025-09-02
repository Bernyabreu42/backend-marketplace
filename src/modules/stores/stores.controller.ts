import type { Request, Response } from "express";
import prisma from "../../database/prisma";
import { ApiResponse } from "../../core/responses/ApiResponse";
import { RolesEnum } from "../../core/enums";
import { paginate } from "../../utils/pagination";
import { ApiPaginatedResponse } from "../../core/responses/ApiPaginatedResponse";
import { deleteImage } from "../../core/services/image-service";
import { updateStoreSchema } from "../../core/validations/stores";
import { userPublicSelect } from "../users/SchemaPublic";
import { validateCreateStore } from "./validated";
import { ownerPublicSelect, storePublicSelect } from "./storePublicSelect";
import { IdSchema } from "../products/validated";
import { andWhere, buildWhere, stripUndef } from "../../utils";

export const createStore = async (req: Request, res: Response) => {
  // req.user debe venir del middleware de auth
  if (!req.user?.id) {
    res.status(401).json({ message: "No autenticado" });
    return;
  }

  const { id, role } = req.user;
  console.log({ id, role });

  // 1) Validación + normalización
  const parsed = validateCreateStore(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json(
        ApiResponse.error({ message: "Datos inválidos", error: parsed.errors })
      );
    return;
  }
  const data = parsed.data;

  // 2) Determinar ownerId (si no eres admin, siempre el actor)
  const isAdmin = role === "admin";
  const ownerId = isAdmin && data.ownerId ? data.ownerId : id;

  try {
    // 3) Verificar que NO tenga ya tienda (ownerId es único)
    const existing = await prisma.store.findUnique({ where: { ownerId } });
    if (existing) {
      res.status(409).json(
        ApiResponse.error({
          message: "Ya existe una tienda para este usuario",
        })
      );
      return;
    }

    // 4) Crear tienda
    const store = await prisma.store.create({
      data: {
        ...data,
        ownerId,
        status: "pending",
      },
      select: storePublicSelect,
    });

    // 5) Si el dueño era buyer, promuévelo a seller (no cambies admin/support)
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { role: true },
    });

    if (owner?.role === RolesEnum.BUYER) {
      await prisma.user.update({
        where: { id: ownerId },
        data: { role: RolesEnum.SELLER },
      });
    }

    res
      .status(201)
      .json(ApiResponse.success({ message: "Tienda creada", data: store }));
  } catch (error: any) {
    if (error?.code === "P2002") {
      res.status(409).json(
        ApiResponse.error({
          message: "Ya existe una tienda para este usuario",
        })
      );
      return;
    }
    res.status(500).json(
      ApiResponse.error({
        message: "Error al crear la tienda",
        error: error?.message ?? String(error),
      })
    );
  }
};

export const getStore = async (req: Request, res: Response) => {
  const { id } = req.params;

  // 1) validar id (uuid)
  const parsed = IdSchema.safeParse(id);

  if (!parsed.success) {
    res.status(400).json(ApiResponse.error({ message: "ID inválido" }));
    return;
  }

  try {
    const store = await prisma.store.findUnique({
      where: { id, isDeleted: false, status: { not: "deleted" } as any },
      select: {
        ...storePublicSelect,
        owner: { select: ownerPublicSelect },
        _count: { select: { products: true, reviews: true } },
      },
    });

    if (!store) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Tienda no encontrada" }));
      return;
    }

    res.json(ApiResponse.success({ data: store }));
  } catch (error: any) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al obtener tienda",
        error: error?.message ?? String(error),
      })
    );
  }
};

export const getAllStores = async (req: Request, res: Response) => {
  try {
    const result = await paginate({
      model: prisma.store,
      query: req.query,
      orderBy: { createdAt: "desc" },
      where: andWhere(
        { isDeleted: false, status: { not: "deleted" } as any },
        buildWhere("store", req.query)
      ),
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
        _count: { select: { products: true, reviews: true } },
      },
    });
    res.json(ApiPaginatedResponse.success(result));
  } catch (error) {
    res
      .status(500)
      .json(ApiResponse.error({ message: "Error al obtener tiendas", error }));
  }
};

//actualizar tienda solo por seller
export const updateStore = async (req: Request, res: Response) => {
  const { id } = req.params;

  const parsed = IdSchema.safeParse(id);

  if (!parsed.success) {
    res.status(400).json(ApiResponse.error({ message: "ID inválido" }));
    return;
  }

  // 1) Validar body
  const validatedStore = updateStoreSchema.safeParse(req.body);

  if (!validatedStore.success) {
    res.status(400).json(
      ApiResponse.error({
        message: "Datos inválidos",
        error: validatedStore.error.flatten().fieldErrors,
      })
    );
    return;
  }

  // 2) Autorización: owner o admin
  const store = await prisma.store.findUnique({
    where: { id },
    select: { ownerId: true, isDeleted: true, status: true },
  });

  if (!store) {
    res
      .status(404)
      .json(ApiResponse.error({ message: "Tienda no encontrada" }));
    return;
  }

  if (store.isDeleted || store.status === "deleted") {
    res.status(409).json(ApiResponse.error({ message: "Tienda eliminada" }));
    return;
  }

  try {
    // console.log("DATA A ACTUALIZAR", validatedStore.data, req.body);
    const updated = await prisma.store.update({
      where: { id, isDeleted: false, status: { not: "deleted" } },
      data: req.body,
      select: storePublicSelect,
    });

    res.json(
      ApiResponse.success({
        message: "Tienda actualizada",
        data: updated,
      })
    );
  } catch (e: any) {
    if (e?.code === "P2025") {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Tienda no encontrada" }));
      return;
    }
    res.status(500).json(
      ApiResponse.error({
        message: "Error al actualizar tienda",
        error: e?.message || String(e),
      })
    );
  }
};

//actualizar status solo por admin
export const updateStoreStatus = async (req: Request, res: Response) => {
  const { storeId } = req.params;
  const { status } = req.body;

  const validStatuses = ["pending", "active", "inactive", "banned", "deleted"];

  if (!validStatuses.includes(status)) {
    res.status(400).json(
      ApiResponse.error({
        message: "Estado de tienda inválido",
      })
    );
    return;
  }

  try {
    const store = await prisma.store.update({
      where: { id: storeId },
      data: { status },
    });

    res.json(
      ApiResponse.success({
        data: store,
        message: "Estado de la tienda actualizado correctamente",
      })
    );
    return;
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al actualizar el estado de la tienda",
        error,
      })
    );
  }
};

//borrar tienda
export const deleteStore = async (req: Request, res: Response) => {
  const { storeId } = req.params;

  try {
    const store = await prisma.store.update({
      where: { id: storeId },
      data: { isDeleted: true },
    });

    res.json(
      ApiResponse.success({
        data: store,
        message: "La tienda ha sido eliminada (soft delete)",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al eliminar la tienda",
        error,
      })
    );
  }
};

export const uploadStoreImages = async (req: Request, res: Response) => {
  const { logo, banner } = req.body;
  const user = req.user;

  if (!banner && !logo) {
    res.status(400).json({
      success: false,
      message: "Debe proporcionar al menos una imagen",
    });
    return;
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { store: true },
    });

    if (!existingUser || !existingUser.store) {
      res
        .status(404)
        .json({ success: false, message: "Usuario o tienda no encontrada" });
      return;
    }

    const updateData: any = {};

    if (logo) {
      if (existingUser.store.logo) {
        await deleteImage(existingUser.store.logo);
      }
      updateData.logo = logo;
    }

    if (banner) {
      if (existingUser.store.banner) {
        await deleteImage(existingUser.store.banner);
      }
      updateData.banner = banner;
    }

    await prisma.store.update({
      where: {
        id: existingUser.store.id,
        ownerId: user.id,
      },
      data: updateData,
    });

    const updatedFields = [];
    if (logo) updatedFields.push("logo");
    if (banner) updatedFields.push("banner");

    res.json(
      ApiResponse.success({
        message: `Imagen${updatedFields.length > 1 ? "es" : ""} actualizada${
          updatedFields.length > 1 ? "s" : ""
        }: ${updatedFields.join(" y ")}`,
      })
    );
    return;
  } catch (error) {
    console.error("Error al actualizar imagen de tienda", error);
    res.status(500).json({
      success: false,
      message: "Error inesperado al actualizar la imagen",
    });
    return;
  }
};
