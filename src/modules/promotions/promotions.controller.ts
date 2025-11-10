import type { Request, Response } from "express";

import { ApiResponse } from "../../core/responses/ApiResponse";
import { ApiPaginatedResponse } from "../../core/responses/ApiPaginatedResponse";
import prisma from "../../database/prisma";
import { paginate } from "../../utils/pagination";
import { stripUndef } from "../../utils";
import { IdSchema } from "../products/validator";
import {
  promotionIdSchema,
  validatePromotion,
  validatePromotionUpdate,
} from "./validator";

export const getAllPromotions = async (req: Request, res: Response) => {
  try {
    const result = await paginate({
      model: prisma.promotion,
      query: req.query,
      where: { isDeleted: false },
      orderBy: { createdAt: "desc" },
    });

    res.json(ApiPaginatedResponse.success(result));
  } catch (error) {
    res
      .status(500)
      .json(
        ApiResponse.error({ message: "Error al obtener promociones", error })
      );
  }
};

export const getPromotionsByStore = async (req: Request, res: Response) => {
  const idCheck = IdSchema.safeParse(req.params.storeId);

  if (!idCheck.success) {
    res.status(400).json(ApiResponse.error({ message: "ID invalido" }));
    return;
  }

  try {
    const result = await paginate({
      model: prisma.promotion,
      query: req.query,
      where: { storeId: idCheck.data, isDeleted: false },
      orderBy: { createdAt: "desc" },
    });

    res.json(ApiPaginatedResponse.success(result));
  } catch (error) {
    res
      .status(500)
      .json(
        ApiResponse.error({ message: "Error al obtener promociones", error })
      );
  }
};

export const getPromotionById = async (req: Request, res: Response) => {
  const rawIdentifier = String(req.params.id ?? "").trim();

  if (!rawIdentifier) {
    res.status(400).json(ApiResponse.error({ message: "Identificador inválido" }));
    return;
  }

  const idCheck = promotionIdSchema.safeParse(rawIdentifier);

  const whereClause = idCheck.success
    ? { id: idCheck.data, isDeleted: false }
    : {
        isDeleted: false,
        type: "coupon" as const,
        OR: [{ code: rawIdentifier }, { name: rawIdentifier }],
      };

  try {
    const promotion = await prisma.promotion.findFirst({
      where: whereClause,
      include: {
        store: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!promotion) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Promocion no encontrada" }));
      return;
    }

    const requester = req.user ?? null;

    if (requester?.id && promotion.type === "coupon" && promotion.id) {
      const alreadyUsed = await prisma.order.count({
        where: {
          userId: requester.id,
          promotionId: promotion.id,
        },
      });

      if (alreadyUsed > 0) {
        res.status(400).json(
          ApiResponse.error({
            message: "Este cupon ya fue utilizado por tu cuenta.",
            error: { alreadyUsed: true },
          })
        );
        return;
      }
    }

    res.json(ApiResponse.success({ data: promotion }));
  } catch (error) {
    res
      .status(500)
      .json(
        ApiResponse.error({ message: "Error al obtener la promocion", error })
      );
  }
};

export const createPromotion = async (req: Request, res: Response) => {
  const parsed = validatePromotion(req.body);

  if (!parsed.success) {
    res.status(400).json(
      ApiResponse.error({
        message: "Datos invalidos",
        error: parsed.error.flatten(),
      })
    );
    return;
  }

  const storeId = req.user?.store?.id;

  if (!storeId) {
    res
      .status(403)
      .json(
        ApiResponse.error({ message: "No se encontro la tienda del usuario" })
      );
    return;
  }

  try {
    const store = await prisma.store.findUnique({ where: { id: storeId } });

    if (!store || store.ownerId !== req.user?.id) {
      res.status(403).json(
        ApiResponse.error({
          message: "No tienes permiso para crear promociones en esta tienda",
        })
      );
      return;
    }

    const promotion = await prisma.promotion.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        type: parsed.data.type,
        value: parsed.data.value ?? null,
        code: parsed.data.code ?? null,
        startsAt: parsed.data.startsAt ?? null,
        endsAt: parsed.data.endsAt ?? null,
        status: parsed.data.status,
        storeId,
      },
    });

    res.json(
      ApiResponse.success({
        message: "Promocion creada correctamente",
        data: promotion,
      })
    );
  } catch (error) {
    res
      .status(500)
      .json(
        ApiResponse.error({ message: "Error al crear la promocion", error })
      );
  }
};

export const updatePromotion = async (req: Request, res: Response) => {
  const idCheck = promotionIdSchema.safeParse(req.params.id);

  if (!idCheck.success) {
    res.status(400).json(ApiResponse.error({ message: "ID invalido" }));
    return;
  }

  const parsed = validatePromotionUpdate(req.body);

  if (!parsed.success) {
    res.status(400).json(
      ApiResponse.error({
        message: "Datos invalidos",
        error: parsed.error.flatten(),
      })
    );
    return;
  }

  const updateData = stripUndef(parsed.data);

  if (Object.keys(updateData).length === 0) {
    res
      .status(400)
      .json(ApiResponse.error({ message: "No hay cambios para aplicar" }));
    return;
  }

  try {
    const promotion = await prisma.promotion.findUnique({
      where: { id: idCheck.data, isDeleted: false },
      include: { store: true },
    });

    if (!promotion) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Promocion no encontrada" }));
      return;
    }

    if (!req.user?.store || promotion.storeId !== req.user.store.id) {
      res.status(403).json(
        ApiResponse.error({
          message: "No tienes permiso para actualizar esta promocion",
        })
      );
      return;
    }

    const updated = await prisma.promotion.update({
      where: { id: idCheck.data },
      data: updateData,
    });

    res.json(
      ApiResponse.success({
        message: "Promocion actualizada",
        data: updated,
      })
    );
  } catch (error) {
    res
      .status(500)
      .json(
        ApiResponse.error({
          message: "Error al actualizar la promocion",
          error,
        })
      );
  }
};

export const deletePromotion = async (req: Request, res: Response) => {
  const idCheck = promotionIdSchema.safeParse(req.params.id);

  if (!idCheck.success) {
    res.status(400).json(ApiResponse.error({ message: "ID invalido" }));
    return;
  }

  try {
    const promotion = await prisma.promotion.findUnique({
      where: { id: idCheck.data, isDeleted: false },
      include: { store: true },
    });

    if (!promotion) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Promocion no encontrada" }));
      return;
    }

    if (!req.user?.store || promotion.storeId !== req.user.store.id) {
      res.status(403).json(
        ApiResponse.error({
          message: "No tienes permiso para eliminar esta promocion",
        })
      );
      return;
    }

    await prisma.promotion.update({
      where: { id: idCheck.data },
      data: {
        isDeleted: true,
        status: "deleted",
        deletedAt: new Date(),
        deletedBy: req.user.id,
      },
    });

    res.json(ApiResponse.success({ message: "Promocion eliminada" }));
  } catch (error) {
    res
      .status(500)
      .json(
        ApiResponse.error({ message: "Error al eliminar la promocion", error })
      );
  }
};

export const restorePromotion = async (req: Request, res: Response) => {
  const idCheck = promotionIdSchema.safeParse(req.params.id);

  if (!idCheck.success) {
    res.status(400).json(ApiResponse.error({ message: "ID invalido" }));
    return;
  }

  try {
    const promotion = await prisma.promotion.findUnique({
      where: { id: idCheck.data },
      include: { store: true },
    });

    if (!promotion) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Promocion no encontrada" }));
      return;
    }

    if (!req.user?.store || promotion.storeId !== req.user.store.id) {
      res.status(403).json(
        ApiResponse.error({
          message: "No tienes permiso para restaurar esta promocion",
        })
      );
      return;
    }

    const restored = await prisma.promotion.update({
      where: { id: idCheck.data },
      data: {
        isDeleted: false,
        status: "active",
        deletedAt: null,
        deletedBy: null,
      },
    });

    res.json(
      ApiResponse.success({
        message: "Promocion restaurada",
        data: restored,
      })
    );
  } catch (error) {
    res
      .status(500)
      .json(
        ApiResponse.error({ message: "Error al restaurar la promocion", error })
      );
  }
};
