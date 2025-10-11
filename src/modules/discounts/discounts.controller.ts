import type { Request, Response } from "express";

import { ApiResponse } from "../../core/responses/ApiResponse";
import { ApiPaginatedResponse } from "../../core/responses/ApiPaginatedResponse";
import prisma from "../../database/prisma";
import { paginate } from "../../utils/pagination";
import { stripUndef } from "../../utils";
import { IdSchema } from "../products/validator";
import {
  discountIdSchema,
  validateDiscount,
  validateDiscountUpdate,
} from "./validator";

export const getAllDiscounts = async (req: Request, res: Response) => {
  try {
    const result = await paginate({
      model: prisma.discount,
      query: req.query,
      where: { isDeleted: false },
      orderBy: { createdAt: "desc" },
    });

    res.json(ApiPaginatedResponse.success(result));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({ message: "Error al obtener descuentos", error })
    );
  }
};

export const getDiscountsByStore = async (req: Request, res: Response) => {
  const idCheck = IdSchema.safeParse(req.params.storeId);

  if (!idCheck.success) {
    res.status(400).json(ApiResponse.error({ message: "ID invalido" }));
    return;
  }

  try {
    const result = await paginate({
      model: prisma.discount,
      query: req.query,
      where: { storeId: idCheck.data, isDeleted: false },
      orderBy: { createdAt: "desc" },
    });

    res.json(ApiPaginatedResponse.success(result));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({ message: "Error al obtener descuentos", error })
    );
  }
};

export const getDiscountById = async (req: Request, res: Response) => {
  const idCheck = discountIdSchema.safeParse(req.params.id);

  if (!idCheck.success) {
    res.status(400).json(ApiResponse.error({ message: "ID invalido" }));
    return;
  }

  try {
    const discount = await prisma.discount.findUnique({
      where: { id: idCheck.data, isDeleted: false },
    });

    if (!discount) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Descuento no encontrado" }));
      return;
    }

    res.json(ApiResponse.success({ data: discount }));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({ message: "Error al obtener el descuento", error })
    );
  }
};

export const createDiscount = async (req: Request, res: Response) => {
  const parsed = validateDiscount(req.body);

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
      .json(ApiResponse.error({ message: "No se encontro la tienda del usuario" }));
    return;
  }

  try {
    const store = await prisma.store.findUnique({ where: { id: storeId } });

    if (!store || store.ownerId !== req.user?.id) {
      res
        .status(403)
        .json(
          ApiResponse.error({
            message: "No tienes permiso para crear descuentos en esta tienda",
          })
        );
      return;
    }

    const discount = await prisma.discount.create({
      data: {
        name: parsed.data.name,
        type: parsed.data.type,
        value: parsed.data.value,
        description: parsed.data.description,
        status: parsed.data.status,
        storeId,
      },
    });

    res.json(
      ApiResponse.success({
        message: "Descuento creado correctamente",
        data: discount,
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({ message: "Error al crear el descuento", error })
    );
  }
};

export const updateDiscount = async (req: Request, res: Response) => {
  const idCheck = discountIdSchema.safeParse(req.params.id);

  if (!idCheck.success) {
    res.status(400).json(ApiResponse.error({ message: "ID invalido" }));
    return;
  }

  const parsed = validateDiscountUpdate(req.body);

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
    const discount = await prisma.discount.findUnique({
      where: { id: idCheck.data, isDeleted: false },
      include: { store: true },
    });

    if (!discount) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Descuento no encontrado" }));
      return;
    }

    if (!req.user?.store || discount.storeId !== req.user.store.id) {
      res
        .status(403)
        .json(
          ApiResponse.error({
            message: "No tienes permiso para actualizar este descuento",
          })
        );
      return;
    }

    const updated = await prisma.discount.update({
      where: { id: idCheck.data },
      data: updateData,
    });

    res.json(
      ApiResponse.success({
        message: "Descuento actualizado",
        data: updated,
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({ message: "Error al actualizar el descuento", error })
    );
  }
};

export const deleteDiscount = async (req: Request, res: Response) => {
  const idCheck = discountIdSchema.safeParse(req.params.id);

  if (!idCheck.success) {
    res.status(400).json(ApiResponse.error({ message: "ID invalido" }));
    return;
  }

  try {
    const discount = await prisma.discount.findUnique({
      where: { id: idCheck.data, isDeleted: false },
      include: { store: true },
    });

    if (!discount) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Descuento no encontrado" }));
      return;
    }

    if (!req.user?.store || discount.storeId !== req.user.store.id) {
      res
        .status(403)
        .json(
          ApiResponse.error({
            message: "No tienes permiso para eliminar este descuento",
          })
        );
      return;
    }

    await prisma.discount.update({
      where: { id: idCheck.data },
      data: {
        isDeleted: true,
        status: "deleted",
        deletedAt: new Date(),
        deletedBy: req.user.id,
      },
    });

    res.json(ApiResponse.success({ message: "Descuento eliminado" }));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({ message: "Error al eliminar el descuento", error })
    );
  }
};

export const restoreDiscount = async (req: Request, res: Response) => {
  const idCheck = discountIdSchema.safeParse(req.params.id);

  if (!idCheck.success) {
    res.status(400).json(ApiResponse.error({ message: "ID invalido" }));
    return;
  }

  try {
    const discount = await prisma.discount.findUnique({
      where: { id: idCheck.data },
      include: { store: true },
    });

    if (!discount) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Descuento no encontrado" }));
      return;
    }

    if (!req.user?.store || discount.storeId !== req.user.store.id) {
      res
        .status(403)
        .json(
          ApiResponse.error({
            message: "No tienes permiso para restaurar este descuento",
          })
        );
      return;
    }

    const restored = await prisma.discount.update({
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
        message: "Descuento restaurado",
        data: restored,
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({ message: "Error al restaurar el descuento", error })
    );
  }
};
