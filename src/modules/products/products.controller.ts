import type { Request, Response } from "express";
import { ApiResponse } from "../../core/responses/ApiResponse";
import prisma from "../../database/prisma";
import { ApiPaginatedResponse } from "../../core/responses/ApiPaginatedResponse";
import { paginate } from "../../utils/pagination";
import { IdSchema, ProductSchema, UpdateProductSchema } from "./validated";
import { z } from "zod";
import { andWhere, buildWhere } from "../../utils";
import { deleteImage } from "../../core/services/image-service";

export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const result = await paginate({
      model: prisma.product,
      query: req.query,
      where: buildWhere("product", req.query),
      include: {
        categories: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        relatedProducts: true,
        taxes: {
          select: {
            tax: {
              select: {
                id: true,
                name: true,
                type: true,
                rate: true,
                description: true,
              },
            },
          },
        },
      },
    });

    const data = result.data.map((p: any) => ({
      ...p,
      taxes: (p.taxes ?? []).map((t: any) => t.tax),
    }));

    res.json(ApiPaginatedResponse.success({ ...result, data }));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al obtener productos",
        error,
      })
    );
    return;
  }
};

export const getProductById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const parsed = IdSchema.safeParse(id);

  if (!parsed.success) {
    res.status(400).json(ApiResponse.error({ message: "ID inválido" }));
    return;
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        categories: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        taxes: {
          select: {
            tax: {
              select: {
                id: true,
                name: true,
                type: true,
                rate: true,
                description: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Producto no encontrado" }));
      return;
    }

    const taxes = product.taxes.map((t) => t.tax);
    const data = { ...product, taxes };

    res.json(
      ApiResponse.success({
        data,
        message: "Producto obtenido exitosamente",
      })
    );
  } catch (error) {
    res
      .status(500)
      .json(ApiResponse.error({ message: "Error al obtener producto", error }));
  }
};

export const getProductByStore = async (req: Request, res: Response) => {
  const { storeId } = req.params;

  const parsed = IdSchema.safeParse(storeId);
  if (!parsed.success) {
    res
      .status(400)
      .json(ApiResponse.error({ message: "ID de tienda inválido" }));
    return;
  }

  try {
    const products = await paginate({
      model: prisma.product,
      query: req.query,
      orderBy: { createdAt: "desc" },
      where: andWhere({ storeId }, buildWhere("product", req.query)),
      include: {
        categories: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    res.json(ApiPaginatedResponse.success(products));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al obtener productos de la tienda",
        error,
      })
    );
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const parsed = ProductSchema.safeParse(req.body);
    console.log(parsed);

    if (!parsed.success) {
      res.status(400).json(
        ApiResponse.error({
          message: "Datos inválidos",
          error: parsed.error.format(),
        })
      );

      return;
    }

    const { categories = [], taxes = [], ...data } = parsed.data;

    // Validar tienda y ownership
    const store = await prisma.store.findUnique({
      where: { id: data.storeId },
    });
    if (!store) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "La tienda no existe" }));
      return;
    }

    if (store.ownerId !== req.user.id) {
      res
        .status(403)
        .json(
          ApiResponse.error({ message: "No tienes permiso para esta acción" })
        );
      return;
    }

    // Crear producto + relaciones (categorías M:N y taxes vía tabla puente)
    const product = await prisma.product.create({
      data: {
        ...data,
        ...(categories.length
          ? {
              categories: {
                connect: categories.map((id: string) => ({ id })),
              },
            }
          : {}),
        ...(taxes.length
          ? { taxes: { create: taxes.map((taxId: string) => ({ taxId })) } }
          : {}),
      },
      include: {
        categories: true,
        taxes: { include: { tax: true } },
      },
    });

    res
      .status(201)
      .json(ApiResponse.success({ data: product, message: "Producto creado" }));
  } catch (error) {
    res
      .status(500)
      .json(ApiResponse.error({ message: "Error al crear producto", error }));
  }
};

export const createRelatedProducts = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { relatedProductIds } = req.body;

  // Validar el ID base
  const validId = IdSchema.safeParse(id);

  if (!validId.success) {
    res
      .status(400)
      .json(ApiResponse.error({ message: "ID de producto inválido" }));
    return;
  }

  // Validar estructura del array
  const RelatedIdsSchema = z.array(z.string().uuid());
  const parsed = RelatedIdsSchema.safeParse(relatedProductIds);

  if (!parsed.success) {
    res.status(400).json(
      ApiResponse.error({
        message: "IDs de productos relacionados inválidos",
        error: parsed.error.format(),
      })
    );
    return;
  }

  try {
    // Verificar que el producto base existe
    const baseProduct = await prisma.product.findUnique({ where: { id } });
    if (!baseProduct) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Producto base no encontrado" }));
      return;
    }

    // Filtrar el mismo ID
    const validIds = relatedProductIds.filter((pid: string) => pid !== id);

    // Verificar que todos los productos relacionados existen
    const existing = await prisma.product.findMany({
      where: { id: { in: validIds } },
      select: { id: true },
    });

    const existingIds = existing.map((p) => p.id);
    if (existingIds.length === 0) {
      res
        .status(404)
        .json(
          ApiResponse.error({ message: "Ningún producto relacionado válido" })
        );
      return;
    }

    // Establecer relación (uno a muchos, unidireccional)
    await prisma.product.update({
      where: { id },
      data: {
        relatedProducts: {
          set: [], // limpia relaciones previas si quieres
          connect: existingIds.map((id) => ({ id })),
        },
      },
    });

    res.json(
      ApiResponse.success({
        message: "Productos relacionados actualizados",
        data: existingIds,
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al relacionar productos",
        error,
      })
    );
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  const { id } = req.params;

  const validId = IdSchema.safeParse(id);

  if (!validId.success) {
    res
      .status(400)
      .json(ApiResponse.error({ message: "ID de producto inválido" }));
    return;
  }

  const parsed = UpdateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(ApiResponse.error({ error: parsed.error.format() }));
    return;
  }

  const existing = await prisma.product.findUnique({
    where: { id },
    include: { store: true },
  });

  if (!existing) {
    res
      .status(404)
      .json(ApiResponse.error({ message: "Producto no encontrado" }));
    return;
  }

  if (existing.store.ownerId !== req.user.id) {
    res.status(403).json(ApiResponse.error({ message: "No autorizado" }));
    return;
  }

  // Desestructura UNA vez
  const {
    categories: categoryIds = [],
    taxes: taxIds = [],
    sku,
    ...rest
  } = parsed.data as {
    categories?: string[];
    taxes?: string[];
    sku?: string | null;
    [k: string]: any;
  };

  // imágenes nuevas que vienen del cliente (array de strings)
  const newImages: string[] = Array.isArray(rest.images) ? rest.images : [];

  // diferencias (lo que hay que borrar del disco)
  const toDelete = (existing.images || []).filter(
    (img) => !newImages.includes(img)
  );

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const payload: any = {
        ...rest,
        sku: typeof sku === "string" && sku.trim() === "" ? null : sku ?? null,
      };

      // reemplaza categorías (si te mandan array)
      if (Array.isArray(categoryIds)) {
        payload.categories = { set: categoryIds.map((cid) => ({ id: cid })) };
      }

      // update base (incluye images = newImages)
      await tx.product.update({ where: { id }, data: payload });

      // taxes por tabla puente
      if (Array.isArray(taxIds)) {
        await tx.productTax.deleteMany({ where: { productId: id } });
        if (taxIds.length) {
          await tx.productTax.createMany({
            data: taxIds.map((taxId) => ({ productId: id, taxId })),
            skipDuplicates: true,
          });
        }
      }

      // devolver producto
      tx.product.findUnique({
        where: { id },
        include: {
          categories: true,
          taxes: { include: { tax: true } },
          relatedProducts: true,
        },
      });
      return;
    });

    // 🔽 fuera de la transacción: borra ficheros huérfanos
    if (toDelete.length) {
      await Promise.allSettled(
        toDelete.map(async (path) => {
          // opcional: evitá borrar si otro producto la usa
          const stillUsed = await prisma.product.count({
            where: { id: { not: id }, images: { has: path } }, // Postgres text[] con operador `has`
          });
          if (stillUsed === 0) {
            await deleteImage(path); // debe ser idempotente
          }
        })
      );
    }

    res.json(
      ApiResponse.success({
        data: updated,
        message: "Producto actualizado",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al actualizar producto",
        error,
      })
    );
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  const { id } = req.params;

  const validId = IdSchema.safeParse(id);
  if (!validId.success) {
    res
      .status(400)
      .json(ApiResponse.error({ message: "ID de producto inválido" }));
    return;
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: { store: true },
    });

    if (!product) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Producto no encontrado" }));
      return;
    }

    if (product.store.ownerId !== req.user.id) {
      res.status(403).json(ApiResponse.error({ message: "No autorizado" }));
      return;
    }

    await prisma.product.delete({ where: { id } });

    res.json(ApiResponse.success({ message: "Producto eliminado" }));
  } catch (error) {
    res
      .status(500)
      .json(
        ApiResponse.error({ message: "Error al eliminar producto", error })
      );
  }
};

export const getRelatedProducts = async (req: Request, res: Response) => {
  const { id } = req.params;

  const validId = IdSchema.safeParse(id);
  if (!validId.success) {
    res
      .status(400)
      .json(ApiResponse.error({ message: "ID de producto inválido" }));
    return;
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        relatedProducts: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!product) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Producto no encontrado" }));
      return;
    }

    res.json(
      ApiResponse.success({
        data: product.relatedProducts,
        message: "Productos relacionados obtenidos",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al obtener productos relacionados",
        error,
      })
    );
    return;
  }
};
