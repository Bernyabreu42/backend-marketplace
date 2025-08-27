import type { Request, Response } from "express";
import prisma from "../../database/prisma";
import { ApiResponse } from "../../core/responses/ApiResponse";
import { paginate } from "../../utils/pagination";
import { ApiPaginatedResponse } from "../../core/responses/ApiPaginatedResponse";
import { ValidatedTaxes } from "./validated";
import { IdSchema } from "../products/validated";

// Obtener todos los taxes (paginado)
export const getAllTaxes = async (req: Request, res: Response) => {
  try {
    const result = await paginate({
      model: prisma.tax,
      query: req.query,
      include: { productTax: true },
      // where: { isActive: true, isDeleted: false },
    });
    res.json(ApiPaginatedResponse.success(result));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al obtener impuestos",
        error,
      })
    );
  }
};

// Obtener todos los taxes por tienda
export const getTaxesByStore = async (req: Request, res: Response) => {
  const { storeId } = req.params;

  const parsed = IdSchema.safeParse(storeId);

  if (!parsed.success) {
    res.status(400).json(ApiResponse.error({ message: "ID inválido" }));
    return;
  }

  try {
    const result = await paginate({
      model: prisma.tax,
      query: req.query,
      where: { storeId },
    });

    res.json(ApiPaginatedResponse.success(result));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al obtener impuestos de la tienda",
        error,
      })
    );
  }
};

// Obtener un tax por ID
export const getTaxById = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const tax = await prisma.tax.findUnique({
      where: { id },
    });

    if (!tax) {
      res.status(404).json(
        ApiResponse.error({
          message: "Impuesto no encontrado",
        })
      );
      return;
    }

    res.json(
      ApiResponse.success({ message: "Impuesto encontrado", data: tax })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al obtener el impuesto",
        error,
      })
    );
  }
};

// Crear un tax
export const createTax = async (req: Request, res: Response) => {
  const parsed = ValidatedTaxes.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json(
      ApiResponse.error({
        message: "Datos inválidos",
        error: parsed.error.flatten(),
      })
    );
    return;
  }

  const { name, type, rate, description } = parsed.data;

  try {
    const storeExists = await prisma.store.findUnique({
      where: { id: req.user.store?.id },
    });

    if (!storeExists) {
      res.status(404).json(
        ApiResponse.error({
          message: "La tienda no existe",
        })
      );
      return;
    }

    if (storeExists.ownerId !== req.user.id) {
      res.status(403).json(
        ApiResponse.error({
          message: "No tienes permiso para crear impuestos en esta tienda",
        })
      );
      return;
    }

    const newTax = await prisma.tax.create({
      data: {
        name,
        type,
        rate,
        description,
        status: "active", // or the appropriate default value for your model
        store: {
          connect: { id: req.user.store?.id },
        },
      },
    });

    res.status(201).json(
      ApiResponse.success({
        message: "Impuesto creado exitosamente",
        data: newTax,
      })
    );
    return;
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al crear el impuesto",
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return;
  }
};

// Actualizar un tax
export const updateTax = async (req: Request, res: Response) => {
  const { id } = req.params;

  // Use the underlying schema with .partial() for updates
  const parsed = ValidatedTaxes._def.schema.partial().safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json(
      ApiResponse.error({
        message: "Datos inválidos",
        error: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const existingTax = await prisma.tax.findUnique({
      where: { id, status: { not: "deleted" }, isDeleted: false },
    });

    if (!existingTax) {
      res.status(404).json(
        ApiResponse.error({
          message: "El impuesto no existe",
        })
      );
      return;
    }

    if (req.user.store) {
      if (existingTax.storeId !== req.user.store.id) {
        res.status(403).json(
          ApiResponse.error({
            message: "No tienes permiso para editar este impuesto",
          })
        );
        return;
      }
    } else {
      res.status(403).json(
        ApiResponse.error({
          message: "No tienes permiso para editar impuestos",
        })
      );
      return;
    }

    const updatedTax = await prisma.tax.update({
      where: { id },
      data: parsed.data,
    });

    res.json(
      ApiResponse.success({
        message: "Impuesto actualizado correctamente",
        data: updatedTax,
      })
    );
    return;
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al actualizar el impuesto",
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return;
  }
};

// Eliminar un tax
export const deleteTax = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const tax = await prisma.tax.findUnique({
      where: { id, status: { not: "deleted" }, isDeleted: false },
      include: { store: true },
    });

    if (!tax) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Impuesto no encontrado" }));
      return;
    }

    if (req.user.store) {
      if (tax.storeId !== req.user.store.id) {
        res.status(403).json(
          ApiResponse.error({
            message: "No tienes permiso para eliminar este impuesto",
          })
        );
        return;
      }
    } else {
      res.status(403).json(
        ApiResponse.error({
          message: "No tienes permiso para eliminar impuestos",
        })
      );
      return;
    }

    await await prisma.tax.update({
      where: { id: id },
      data: {
        isDeleted: true,
        status: "deleted",
        deletedAt: new Date(),
        deletedBy: req.user.id,
      },
    });

    res.json(
      ApiResponse.success({
        message: "Impuesto eliminado correctamente",
      })
    );
  } catch (error) {
    res.status(400).json(
      ApiResponse.error({
        message: "Error al eliminar el impuesto",
        error,
      })
    );
  }
};

// Eliminar un tax
export const RestaurarTax = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const tax = await prisma.tax.findUnique({
      where: { id },
      include: { store: true },
    });

    if (!tax) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Impuesto no encontrado" }));
      return;
    }

    if (req.user.store) {
      if (tax.storeId !== req.user.store.id) {
        res.status(403).json(
          ApiResponse.error({
            message: "No tienes permiso para restaurar este impuesto",
          })
        );
        return;
      }
    } else {
      res.status(403).json(
        ApiResponse.error({
          message: "No tienes permiso para restaurar impuestos",
        })
      );
      return;
    }

    await await prisma.tax.update({
      where: { id: id },
      data: {
        isDeleted: false,
        status: "active",
        deletedAt: null,
        deletedBy: null,
      },
    });

    res.json(
      ApiResponse.success({
        message: "Impuesto restaurado correctamente",
      })
    );
  } catch (error) {
    res.status(400).json(
      ApiResponse.error({
        message: "Error al restaurar el impuesto",
        error,
      })
    );
  }
};
