import type { Request, Response } from "express";
import { ApiResponse } from "../../core/responses/ApiResponse";
import prisma from "../../database/prisma";
import { IdSchema } from "../products/validator";
import {
  CreateShippingMethodSchema,
  UpdateShippingMethodSchema,
} from "./validator";

// Get all shipping methods for a specific store
export const getShippingMethodsByStore = async (
  req: Request,
  res: Response
) => {
  try {
    const { storeId } = req.params;

    const validId = IdSchema.safeParse(storeId);
    if (!validId.success) {
      res
        .status(400)
        .json(ApiResponse.error({ message: "ID de tienda inválido" }));
      return;
    }

    const shippingMethods = await prisma.shippingMethod.findMany({
      where: {
        storeId,
        isDeleted: false, // Only show non-deleted methods
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    res.json(ApiResponse.success({ data: shippingMethods }));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al obtener los métodos de envío",
        error,
      })
    );
  }
};

// Get a single shipping method by ID
export const getShippingMethodById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const validId = IdSchema.safeParse(id);
    if (!validId.success) {
      res
        .status(400)
        .json(ApiResponse.error({ message: "ID de método de envío inválido" }));
      return;
    }

    const shippingMethod = await prisma.shippingMethod.findUnique({
      where: { id },
    });

    if (!shippingMethod || shippingMethod.isDeleted) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Método de envío no encontrado" }));
      return;
    }

    res.json(ApiResponse.success({ data: shippingMethod }));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al obtener el método de envío",
        error,
      })
    );
  }
};

// Create a new shipping method for the authenticated seller's store
export const createShippingMethod = async (req: Request, res: Response) => {
  try {
    // The user and their storeId are expected to be on the request object
    // This is populated by the routeProtector middleware
    const storeId = req.user?.storeId;

    if (!storeId) {
      res.status(403).json(
        ApiResponse.error({
          message: "Acceso denegado. No tienes una tienda asociada.",
        })
      );
      return;
    }

    const parsed = CreateShippingMethodSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(
        ApiResponse.error({
          message: "Datos inválidos",
          error: parsed.error.format(),
        })
      );
      return;
    }

    const { name, description, cost, status } = parsed.data;

    const newMethod = await prisma.shippingMethod.create({
      data: {
        name,
        description,
        cost,
        status,
        storeId,
      },
    });

    res.status(201).json(
      ApiResponse.success({
        data: newMethod,
        message: "Método de envío creado exitosamente",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al crear el método de envío",
        error,
      })
    );
  }
};

// Update an existing shipping method
export const updateShippingMethod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const storeId = req.user?.storeId;

    const validId = IdSchema.safeParse(id);
    if (!validId.success) {
      res
        .status(400)
        .json(ApiResponse.error({ message: "ID de método de envío inválido" }));
      return;
    }

    if (!storeId) {
      res.status(403).json(
        ApiResponse.error({
          message: "Acceso denegado. No tienes una tienda asociada.",
        })
      );
      return;
    }

    const parsed = UpdateShippingMethodSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(
        ApiResponse.error({
          message: "Datos inválidos",
          error: parsed.error.format(),
        })
      );
      return;
    }

    const existingMethod = await prisma.shippingMethod.findUnique({
      where: { id },
    });

    if (!existingMethod || existingMethod.isDeleted) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Método de envío no encontrado" }));
      return;
    }

    // Authorization check: ensure the method belongs to the user's store
    if (existingMethod.storeId !== storeId) {
      res.status(403).json(
        ApiResponse.error({
          message: "Acceso denegado. No puedes modificar este recurso.",
        })
      );
      return;
    }

    const updatedMethod = await prisma.shippingMethod.update({
      where: { id },
      data: parsed.data,
    });

    res.json(
      ApiResponse.success({
        data: updatedMethod,
        message: "Método de envío actualizado exitosamente",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al actualizar el método de envío",
        error,
      })
    );
  }
};

// Soft delete a shipping method
export const deleteShippingMethod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const storeId = req.user?.storeId;
    const userId = req.user?.id;

    const validId = IdSchema.safeParse(id);
    if (!validId.success) {
      res
        .status(400)
        .json(ApiResponse.error({ message: "ID de método de envío inválido" }));
      return;
    }

    if (!storeId || !userId) {
      res.status(403).json(
        ApiResponse.error({
          message: "Acceso denegado. No tienes una tienda asociada.",
        })
      );
      return;
    }

    const existingMethod = await prisma.shippingMethod.findUnique({
      where: { id },
    });

    if (!existingMethod || existingMethod.isDeleted) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Método de envío no encontrado" }));
      return;
    }

    // Authorization check
    if (existingMethod.storeId !== storeId) {
      res.status(403).json(
        ApiResponse.error({
          message: "Acceso denegado. No puedes eliminar este recurso.",
        })
      );
      return;
    }

    await prisma.shippingMethod.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId,
        status: "inactive",
      },
    });

    res.json(
      ApiResponse.success({
        message: "Método de envío eliminado correctamente",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al eliminar el método de envío",
        error,
      })
    );
  }
};
