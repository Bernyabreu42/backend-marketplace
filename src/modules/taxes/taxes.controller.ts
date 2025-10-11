import type { Request, Response } from "express";

import { ApiResponse } from "../../core/responses/ApiResponse";
import { ApiPaginatedResponse } from "../../core/responses/ApiPaginatedResponse";
import prisma from "../../database/prisma";
import { paginate } from "../../utils/pagination";
import { stripUndef } from "../../utils";
import { IdSchema } from "../products/validator";
import {
  taxIdSchema,
  validateTax,
  validateTaxUpdate,
} from "./validator";

export const getAllTaxes = async (req: Request, res: Response) => {
  try {
    const result = await paginate({
      model: prisma.tax,
      query: req.query,
      where: { isDeleted: false },
      orderBy: { createdAt: "desc" },
    });

    res.json(ApiPaginatedResponse.success(result));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({ message: "Error al obtener impuestos", error })
    );
  }
};

export const getTaxesByStore = async (req: Request, res: Response) => {
  const idCheck = IdSchema.safeParse(req.params.storeId);

  if (!idCheck.success) {
    res.status(400).json(ApiResponse.error({ message: "ID invalido" }));
    return;
  }

  try {
    const result = await paginate({
      model: prisma.tax,
      query: req.query,
      where: { storeId: idCheck.data, isDeleted: false },
      orderBy: { createdAt: "desc" },
    });

    res.json(ApiPaginatedResponse.success(result));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({ message: "Error al obtener impuestos", error })
    );
  }
};

export const getTaxById = async (req: Request, res: Response) => {
  const idCheck = taxIdSchema.safeParse(req.params.id);

  if (!idCheck.success) {
    res.status(400).json(ApiResponse.error({ message: "ID invalido" }));
    return;
  }

  try {
    const tax = await prisma.tax.findUnique({
      where: { id: idCheck.data, isDeleted: false },
    });

    if (!tax) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Impuesto no encontrado" }));
      return;
    }

    res.json(ApiResponse.success({ data: tax }));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({ message: "Error al obtener el impuesto", error })
    );
  }
};

export const createTax = async (req: Request, res: Response) => {
  const parsed = validateTax(req.body);

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
            message: "No tienes permiso para crear impuestos en esta tienda",
          })
        );
      return;
    }

    const tax = await prisma.tax.create({
      data: {
        name: parsed.data.name,
        type: parsed.data.type,
        rate: parsed.data.rate,
        description: parsed.data.description,
        status: parsed.data.status,
        storeId: storeId,
      },
    });

    res.json(
      ApiResponse.success({
        message: "Impuesto creado correctamente",
        data: tax,
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({ message: "Error al crear el impuesto", error })
    );
  }
};

export const updateTax = async (req: Request, res: Response) => {
  const idCheck = taxIdSchema.safeParse(req.params.id);

  if (!idCheck.success) {
    res.status(400).json(ApiResponse.error({ message: "ID invalido" }));
    return;
  }

  const parsed = validateTaxUpdate(req.body);

  if (!parsed.success) {
    res.status(400).json(
      ApiResponse.error({
        message: "Datos invalidos",
        error: parsed.error.flatten(),
      })
    );
    return;
  }

  if (Object.keys(stripUndef(parsed.data)).length === 0) {
    res
      .status(400)
      .json(ApiResponse.error({ message: "No hay cambios para aplicar" }));
    return;
  }

  try {
    const tax = await prisma.tax.findUnique({
      where: { id: idCheck.data, isDeleted: false },
      include: { store: true },
    });

    if (!tax) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Impuesto no encontrado" }));
      return;
    }

    if (!req.user?.store || tax.storeId !== req.user.store.id) {
      res
        .status(403)
        .json(
          ApiResponse.error({
            message: "No tienes permiso para actualizar este impuesto",
          })
        );
      return;
    }

    const updated = await prisma.tax.update({
      where: { id: idCheck.data },
      data: stripUndef(parsed.data),
    });

    res.json(
      ApiResponse.success({
        message: "Impuesto actualizado",
        data: updated,
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({ message: "Error al actualizar el impuesto", error })
    );
  }
};

export const deleteTax = async (req: Request, res: Response) => {
  const idCheck = taxIdSchema.safeParse(req.params.id);

  if (!idCheck.success) {
    res.status(400).json(ApiResponse.error({ message: "ID invalido" }));
    return;
  }

  try {
    const tax = await prisma.tax.findUnique({
      where: { id: idCheck.data, isDeleted: false },
      include: { store: true },
    });

    if (!tax) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Impuesto no encontrado" }));
      return;
    }

    if (!req.user?.store || tax.storeId !== req.user.store.id) {
      res
        .status(403)
        .json(
          ApiResponse.error({
            message: "No tienes permiso para eliminar este impuesto",
          })
        );
      return;
    }

    await prisma.tax.update({
      where: { id: idCheck.data },
      data: {
        isDeleted: true,
        status: "deleted",
        deletedAt: new Date(),
        deletedBy: req.user.id,
      },
    });

    res.json(ApiResponse.success({ message: "Impuesto eliminado" }));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({ message: "Error al eliminar el impuesto", error })
    );
  }
};

export const restoreTax = async (req: Request, res: Response) => {
  const idCheck = taxIdSchema.safeParse(req.params.id);

  if (!idCheck.success) {
    res.status(400).json(ApiResponse.error({ message: "ID invalido" }));
    return;
  }

  try {
    const tax = await prisma.tax.findUnique({
      where: { id: idCheck.data },
      include: { store: true },
    });

    if (!tax) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Impuesto no encontrado" }));
      return;
    }

    if (!req.user?.store || tax.storeId !== req.user.store.id) {
      res
        .status(403)
        .json(
          ApiResponse.error({
            message: "No tienes permiso para restaurar este impuesto",
          })
        );
      return;
    }

    const restored = await prisma.tax.update({
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
        message: "Impuesto restaurado",
        data: restored,
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({ message: "Error al restaurar el impuesto", error })
    );
  }
};
