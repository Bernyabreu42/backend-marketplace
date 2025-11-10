import type { Request, Response } from "express";

import prisma from "../../database/prisma";
import { ApiResponse } from "../../core/responses/ApiResponse";
import { ApiPaginatedResponse } from "../../core/responses/ApiPaginatedResponse";
import { paginate } from "../../utils/pagination";
import { IdSchema } from "../products/validator";

const favoriteProductSelection = {
  id: true,
  name: true,
  price: true,
  priceFinal: true,
  images: true,
  status: true,
  favoritesCount: true,
  store: {
    select: {
      id: true,
      name: true,
      status: true,
      isDeleted: true,
    },
  },
} as const;

const ensureProductIsFavoritable = async (productId: string) => {
  return prisma.product.findFirst({
    where: {
      id: productId,
      status: "active",
      store: { status: "active", isDeleted: false },
    },
    select: { id: true },
  });
};

export const getFavorites = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res
      .status(401)
      .json(ApiResponse.error({ message: "Autenticacion requerida" }));
    return;
  }

  try {
    const result = await paginate({
      model: prisma.favorite,
      query: req.query,
      where: {
        userId: req.user.id,
        product: {
          status: "active",
          store: { status: "active", isDeleted: false },
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        product: {
          select: favoriteProductSelection,
        },
      },
    });

    res.json(ApiPaginatedResponse.success(result));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al obtener favoritos",
        error,
      })
    );
  }
};

export const addFavorite = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res
      .status(401)
      .json(ApiResponse.error({ message: "Autenticacion requerida" }));
    return;
  }

  const parsed = IdSchema.safeParse(req.params.productId);
  if (!parsed.success) {
    res.status(400).json(
      ApiResponse.error({
        message: "ID de producto invalido",
        error: parsed.error.format(),
      })
    );
    return;
  }

  try {
    const favoriteExists = await prisma.favorite.findUnique({
      where: {
        userId_productId: {
          userId: req.user.id,
          productId: parsed.data,
        },
      },
    });

    if (favoriteExists) {
      res.json(
        ApiResponse.success({
          message: "Producto ya estaba en favoritos",
        })
      );
      return;
    }

    const product = await ensureProductIsFavoritable(parsed.data);
    if (!product) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Producto no disponible" }));
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.favorite.create({
        data: {
          userId: req.user!.id,
          productId: parsed.data,
        },
      });

      await tx.product.update({
        where: { id: parsed.data },
        data: { favoritesCount: { increment: 1 } },
      });
    });

    res.json(
      ApiResponse.success({
        message: "Producto agregado a favoritos",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al agregar a favoritos",
        error,
      })
    );
  }
};

export const removeFavorite = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res
      .status(401)
      .json(ApiResponse.error({ message: "Autenticacion requerida" }));
    return;
  }

  const parsed = IdSchema.safeParse(req.params.productId);
  if (!parsed.success) {
    res.status(400).json(
      ApiResponse.error({
        message: "ID de producto invalido",
        error: parsed.error.format(),
      })
    );
    return;
  }

  try {
    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_productId: {
          userId: req.user.id,
          productId: parsed.data,
        },
      },
    });

    if (!favorite) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Favorito no encontrado" }));
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.favorite.delete({
        where: { id: favorite.id },
      });

      await tx.product.update({
        where: { id: parsed.data },
        data: { favoritesCount: { decrement: 1 } },
      });
    });

    res.json(
      ApiResponse.success({
        message: "Producto eliminado de favoritos",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al eliminar de favoritos",
        error,
      })
    );
  }
};
