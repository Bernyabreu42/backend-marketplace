import type { Request, Response } from "express";
import { ApiResponse } from "../../core/responses/ApiResponse";
import prisma from "../../database/prisma";
import { ApiPaginatedResponse } from "../../core/responses/ApiPaginatedResponse";
import { paginate } from "../../utils/pagination";
import { IdSchema, ProductSchema, UpdateProductSchema } from "./validator";
import { z } from "zod";
import { andWhere, buildWhere } from "../../utils";
import { deleteImage } from "../../core/services/image-service";
import { verifyAccessToken } from "../../utils/jwt";
import { RolesEnum } from "../../core/enums";

type RequesterContext = {
  id: string;
  role: RolesEnum;
};

const hasStoreVisibility = (
  requester: RequesterContext | null,
  ownerId?: string | null
) => {
  if (!requester) return false;
  if (ownerId && requester.id === ownerId) return true;
  return (
    requester.role === RolesEnum.ADMIN || requester.role === RolesEnum.SUPPORT
  );
};

const resolveRequester = async (
  req: Request
): Promise<RequesterContext | null> => {
  if (req.user?.id && req.user?.role) {
    return {
      id: req.user.id,
      role: req.user.role as RolesEnum,
    };
  }

  const accessToken = req.cookies?.accessToken;
  if (!accessToken) return null;

  try {
    const payload = verifyAccessToken(accessToken) as {
      sub?: string;
      id?: string;
    };
    const userId = payload?.sub ?? payload?.id;
    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) return null;

    return {
      id: user.id,
      role: user.role as RolesEnum,
    };
  } catch {
    return null;
  }
};

export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const result = await paginate({
      model: prisma.product,
      query: req.query,
      where: andWhere(
        { store: { status: "active", isDeleted: false } },
        buildWhere("product", req.query)
      ),
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
    const requester = await resolveRequester(req);

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        store: {
          select: { status: true, isDeleted: true, ownerId: true },
        },
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

    const storeMeta = product.store;

    if (!storeMeta || storeMeta.isDeleted) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Producto no disponible" }));
      return;
    }

    const canViewInactive =
      storeMeta.status === "active" ||
      hasStoreVisibility(requester, storeMeta.ownerId);

    if (!canViewInactive) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Producto no disponible" }));
      return;
    }

    const taxes = product.taxes.map((t) => t.tax);
    const { store: _store, ...productData } = product;
    const data = { ...productData, taxes };

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
    const requester = await resolveRequester(req);

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, ownerId: true, status: true, isDeleted: true },
    });

    if (!store || store.isDeleted) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Tienda no disponible" }));
      return;
    }

    const canViewInactive =
      store.status === "active" ||
      hasStoreVisibility(requester, store.ownerId);

    if (!canViewInactive) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Tienda no disponible" }));
      return;
    }

    const baseFilter = hasStoreVisibility(requester, store.ownerId)
      ? { storeId }
      : { storeId, store: { status: "active", isDeleted: false } };

    const products = await paginate({
      model: prisma.product,
      query: req.query,
      orderBy: { createdAt: "desc" },
      where: andWhere(
        baseFilter,
        buildWhere("product", req.query)
      ),
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

    if (!parsed.success) {
      res.status(400).json(
        ApiResponse.error({
          message: "Datos inválidos",
          error: parsed.error.format(),
        })
      );

      return;
    }

    const { categories = [], taxes = [], discountId, ...data } = parsed.data;

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

    if (store.ownerId !== req?.user.id) {
      res
        .status(403)
        .json(
          ApiResponse.error({ message: "No tienes permiso para esta acción" })
        );
      return;
    }

    // --- LÓGICA DE CÁLCULO DE PRECIO ---
    let finalPrice = data.price;
    if (discountId) {
      const discount = await prisma.discount.findUnique({
        where: { id: discountId },
      });
      if (discount) {
        const basePrice = data.price;
        if (discount.type === "percentage") {
          finalPrice = basePrice - (basePrice * discount.value) / 100;
        } else if (discount.type === "fixed") {
          finalPrice = basePrice - discount.value;
        }
      }
    }
    // --- FIN DE LA LÓGICA ---

    // Crear producto + relaciones (categorías M:N y taxes vía tabla puente)
    const product = await prisma.product.create({
      data: {
        ...data,
        priceFinal: finalPrice,
        discountId: discountId,
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
    taxes: taxIds, // No lo usamos para el precio final, sino en la orden
    discountId, // <-- ¡NUEVO! Recibimos el ID del descuento
    sku,
    ...rest
  } = parsed.data as {
    categories?: string[];
    taxes?: string[]; // Mantener para la relación
    discountId?: string | null; // Puede ser nulo para quitar el descuento
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
    // --- NUEVA LÓGICA DE CÁLCULO DE PRECIO ---
    let finalPrice = parsed.data.price ?? existing.price; // Usa el precio nuevo o el existente como base
    let finalDiscountId =
      discountId === undefined ? existing.discountId : discountId;

    if (finalDiscountId) {
      const discount = await prisma.discount.findUnique({
        where: { id: finalDiscountId },
      });
      if (discount) {
        const basePrice = parsed.data.price ?? existing.price;
        if (discount.type === "percentage") {
          finalPrice = basePrice - (basePrice * discount.value) / 100;
        } else if (discount.type === "fixed") {
          finalPrice = basePrice - discount.value;
        }
      }
    } else {
      // Si no hay promotionId, el precio final es el precio base
      finalPrice = parsed.data.price ?? existing.price;
    }
    // --- FIN DE LA LÓGICA ---

    const updated = await prisma.$transaction(async (tx) => {
      const payload: any = {
        ...rest,
        sku: typeof sku === "string" && sku.trim() === "" ? null : sku ?? null,
        priceFinal: finalPrice, // <-- Usamos el precio calculado
        discountId: finalDiscountId, // <-- Guardamos la referencia al descuento
      };

      // reemplaza categorías (si te mandan array)
      if (Array.isArray(categoryIds)) {
        payload.categories = { set: categoryIds.map((cid) => ({ id: cid })) };
      }

      // update base (incluye images = newImages)
      await tx.product.update({ where: { id }, data: payload });

      // taxes por tabla puente
      if (taxIds && Array.isArray(taxIds)) {
        await tx.productTax.deleteMany({ where: { productId: id } });
        if (taxIds.length) {
          await tx.productTax.createMany({
            data: taxIds.map((taxId) => ({ productId: id, taxId })),
            skipDuplicates: true,
          });
        }
      }

      // devolver producto
      return tx.product.findUnique({
        // <-- Añadir return para que la transacción devuelva el producto
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
    const requester = await resolveRequester(req);

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        store: {
          select: { status: true, isDeleted: true, ownerId: true },
        },
        relatedProducts: {
          where: { store: { status: "active", isDeleted: false } },
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

    const store = product.store;

    if (!store || store.isDeleted) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Producto no disponible" }));
      return;
    }

    const canViewInactive =
      store.status === "active" || hasStoreVisibility(requester, store.ownerId);

    if (!canViewInactive) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Producto no disponible" }));
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
