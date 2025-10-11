import type { Request, Response } from "express";
import { ApiResponse } from "../../core/responses/ApiResponse";
import { ApiPaginatedResponse } from "../../core/responses/ApiPaginatedResponse";
import prisma from "../../database/prisma";
import { paginate } from "../../utils/pagination";
import { IdSchema } from "../products/validator";
import { RolesEnum } from "../../core/enums";
import {
  CreateReviewSchema,
  UpdateReviewSchema,
} from "./validator";
import { reviewPublicSelect } from "./reviewSelect";

const buildPaginationResponse = (result: any) => {
  const data = result.data.map((review: any) => ({
    ...review,
    user: review.user ?? null,
  }));

  return { ...result, data };
};

export const getReviewsByProduct = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const validId = IdSchema.safeParse(productId);

    if (!validId.success) {
      res
        .status(400)
        .json(ApiResponse.error({ message: "ID de producto inválido" }));
      return;
    }

    const result = await paginate({
      model: prisma.review,
      query: req.query,
      where: { productId },
      orderBy: { createdAt: "desc" },
      select: reviewPublicSelect,
    });

    res.json(ApiPaginatedResponse.success(buildPaginationResponse(result)));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al obtener las reseñas del producto",
        error,
      })
    );
  }
};

export const getReviewsByStore = async (req: Request, res: Response) => {
  try {
    const { storeId } = req.params;
    const validId = IdSchema.safeParse(storeId);

    if (!validId.success) {
      res
        .status(400)
        .json(ApiResponse.error({ message: "ID de tienda inválido" }));
      return;
    }

    const result = await paginate({
      model: prisma.review,
      query: req.query,
      where: { storeId },
      orderBy: { createdAt: "desc" },
      select: reviewPublicSelect,
    });

    res.json(ApiPaginatedResponse.success(buildPaginationResponse(result)));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al obtener las reseñas de la tienda",
        error,
      })
    );
  }
};

export const createReview = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      res
        .status(401)
        .json(ApiResponse.error({ message: "No autenticado" }));
      return;
    }

    const parsed = CreateReviewSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json(
        ApiResponse.error({
          message: "Datos inválidos",
          error: parsed.error.flatten().fieldErrors,
        })
      );
      return;
    }

    const { productId, rating, comment } = parsed.data;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, storeId: true },
    });

    if (!product) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Producto no encontrado" }));
      return;
    }

    const existingReview = await prisma.review.findFirst({
      where: { userId: req.user.id, productId },
    });

    if (existingReview) {
      res
        .status(409)
        .json(
          ApiResponse.error({
            message: "Ya has enviado una reseña para este producto",
          })
        );
      return;
    }

    const review = await prisma.review.create({
      data: {
        rating,
        comment,
        productId,
        storeId: product.storeId,
        userId: req.user.id,
      },
      select: reviewPublicSelect,
    });

    res
      .status(201)
      .json(
        ApiResponse.success({
          data: review,
          message: "Reseña creada exitosamente",
        })
      );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al crear la reseña",
        error,
      })
    );
  }
};

export const updateReview = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validId = IdSchema.safeParse(id);

    if (!validId.success) {
      res
        .status(400)
        .json(ApiResponse.error({ message: "ID de reseña inválido" }));
      return;
    }

    const parsed = UpdateReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(
        ApiResponse.error({
          message: "Datos inválidos",
          error: parsed.error.flatten().fieldErrors,
        })
      );
      return;
    }

    const review = await prisma.review.findUnique({
      where: { id },
    });

    if (!review) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Reseña no encontrada" }));
      return;
    }

    const isAdmin = req.user?.role === RolesEnum.ADMIN;
    if (!isAdmin && review.userId !== req.user?.id) {
      res
        .status(403)
        .json(ApiResponse.error({ message: "No estás autorizado" }));
      return;
    }

    const updated = await prisma.review.update({
      where: { id },
      data: parsed.data,
      select: reviewPublicSelect,
    });

    res.json(
      ApiResponse.success({
        data: updated,
        message: "Reseña actualizada correctamente",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al actualizar la reseña",
        error,
      })
    );
  }
};

export const deleteReview = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validId = IdSchema.safeParse(id);

    if (!validId.success) {
      res
        .status(400)
        .json(ApiResponse.error({ message: "ID de reseña inválido" }));
      return;
    }

    const review = await prisma.review.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!review) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Reseña no encontrada" }));
      return;
    }

    const isAdmin = req.user?.role === RolesEnum.ADMIN;
    if (!isAdmin && review.userId !== req.user?.id) {
      res
        .status(403)
        .json(ApiResponse.error({ message: "No estás autorizado" }));
      return;
    }

    await prisma.review.delete({ where: { id } });

    res.json(
      ApiResponse.success({
        message: "Reseña eliminada correctamente",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al eliminar la reseña",
        error,
      })
    );
  }
};
