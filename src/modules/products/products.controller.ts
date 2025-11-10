import type { Request, Response } from "express";
import { ApiResponse } from "../../core/responses/ApiResponse";
import prisma from "../../database/prisma";
import { ApiPaginatedResponse } from "../../core/responses/ApiPaginatedResponse";
import { paginate } from "../../utils/pagination";
import { IdSchema, ProductSchema, UpdateProductSchema } from "./validator";
import { z } from "zod";
import { andWhere, buildWhere } from "../../utils";
import { deleteImage } from "../../core/services/image-service";
import { RolesEnum } from "../../core/enums";
import {
  buildProductVisibilityFilter,
  hasStoreVisibility,
  resolveRequester,
} from "./services/visibility.service";
import {
  computePriceWithDiscount,
  findApplicableDiscount,
  type DiscountSummary,
} from "./services/pricing.service";
import {
  buildFallbackSearchClause,
  extractSearchTerm,
  findProductIdsBySearchTerm,
  resolvePaginationParams,
} from "./services/search.service";
import { findFavoriteProductIds } from "./services/favorite.service";

export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const requester = await resolveRequester(req);
    const visibilityFilter = buildProductVisibilityFilter(requester);

    const queryWithoutQ = { ...(req.query as Record<string, any>) };
    const searchTerm = extractSearchTerm(queryWithoutQ.q);
    delete queryWithoutQ.q;

    let searchFilter: any;
    if (searchTerm.length >= 2) {
      const matchingIds = await findProductIdsBySearchTerm(searchTerm);
      if (Array.isArray(matchingIds)) {
        if (matchingIds.length === 0) {
          const { page, limit } = resolvePaginationParams(req.query);
          res.json(
            ApiPaginatedResponse.success({
              data: [],
              pagination: {
                total: 0,
                page,
                limit,
                totalPages: 0,
                next: false,
                prev: page > 1,
              },
            })
          );
          return;
        }
        searchFilter = { id: { in: matchingIds } };
      } else {
        searchFilter = buildFallbackSearchClause(searchTerm);
      }
    }

    const result = await paginate({
      model: prisma.product,
      query: req.query,
      where: andWhere(
        visibilityFilter,
        searchFilter,
        buildWhere("product", queryWithoutQ)
      ),
      include: {
        categories: {
          select: {
            id: true,
            name: true,
          },
        },
        relatedProducts: true,
        discount: true,
        _count: { select: { review: true } },
        store: {
          select: { address: true, name: true, id: true },
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

    const mappedProducts = result.data.map((p: any) => ({
      ...p,
      taxes: (p.taxes ?? []).map((t: any) => t.tax),
    }));

    let favoritesSet: Set<string> | null = null;
    if (requester?.id) {
      favoritesSet = await findFavoriteProductIds(
        requester.id,
        mappedProducts.map((p: any) => p.id)
      );
    }

    const data = mappedProducts.map((p: any) => ({
      ...p,
      isFavorite: favoritesSet?.has(p.id) ?? false,
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
          select: {
            id: true,
            name: true,
            address: true,
            logo:true,
            email: true,
            phone:true,
            isDeleted:true,
            status:true,
            ownerId: true,
            reviews:true,
            createdAt:true,
          },
        },
        discount: true,
        _count: { select: { review: true } },
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

    const canViewProduct =
      product.status === "active" ||
      hasStoreVisibility(requester, storeMeta.ownerId);

    if (!canViewProduct) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Producto no disponible" }));
      return;
    }

    const taxes = product.taxes.map((t) => t.tax);
    const { store: storeMetaForResponse, ...productData } = product;
    const {
      ownerId: _ownerId,
      isDeleted: _isDeleted,
      ...storePublic
    } = storeMetaForResponse;

    const isFavorite = requester?.id
      ? Boolean(
          await prisma.favorite.findUnique({
            where: {
              userId_productId: {
                userId: requester.id,
                productId: id,
              },
            },
          })
        )
      : false;

    const data = {
      ...productData,
      store: storePublic,
      taxes,
      isFavorite,
    };

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
      store.status === "active" || hasStoreVisibility(requester, store.ownerId);

    if (!canViewInactive) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Tienda no disponible" }));
      return;
    }

    const baseFilter = hasStoreVisibility(requester, store.ownerId)
      ? { storeId }
      : { storeId, store: { status: "active", isDeleted: false } };
    const visibilityFilter = buildProductVisibilityFilter(requester);

    const queryWithoutQ = { ...(req.query as Record<string, any>) };
    const searchTerm = extractSearchTerm(queryWithoutQ.q);
    delete queryWithoutQ.q;

    let searchFilter: any;
    if (searchTerm.length >= 2) {
      const matchingIds = await findProductIdsBySearchTerm(searchTerm, {
        storeId,
      });

      if (Array.isArray(matchingIds)) {
        if (matchingIds.length === 0) {
          const { page, limit } = resolvePaginationParams(req.query);
          res.json(
            ApiPaginatedResponse.success({
              data: [],
              pagination: {
                total: 0,
                page,
                limit,
                totalPages: 0,
                next: false,
                prev: page > 1,
              },
            })
          );
          return;
        }
        searchFilter = { id: { in: matchingIds } };
      } else {
        searchFilter = buildFallbackSearchClause(searchTerm);
      }
    }

    const products = await paginate({
      model: prisma.product,
      query: req.query,
      orderBy: { createdAt: "desc" },
      where: andWhere(
        baseFilter,
        visibilityFilter,
        searchFilter,
        buildWhere("product", queryWithoutQ)
      ),
      include: {
        _count: { select: { review: true } },
         discount: true,
       categories: {
          select: {
            id: true,
            name: true,
          },
        },
        relatedProducts: true,
        store: {
          select: { address: true, name: true, id: true },
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

    let favoritesSet: Set<string> | null = null;
    if (requester?.id) {
      favoritesSet = await findFavoriteProductIds(
        requester.id,
        products.data.map((p: any) => p.id)
      );
    }

    const data = products.data.map((p: any) => ({
      ...p,
      isFavorite: favoritesSet?.has(p.id) ?? false,
    }));

    res.json(ApiPaginatedResponse.success({ ...products, data }));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al obtener productos de la tienda",
        error,
      })
    );
  }
};

export const searchProducts = async (req: Request, res: Response) => {
  const term = String(req.query.q ?? "").trim();
  const limitParam = Number(req.query.limit ?? 10);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.trunc(limitParam), 1), 30)
    : 10;
  const pageParam = Number(req.query.page ?? 1);
  const page =
    Number.isFinite(pageParam) && pageParam > 0 ? Math.trunc(pageParam) : 1;

  if (term.length < 2) {
    res.status(400).json(
      ApiResponse.error({
        message: "El termino de busqueda debe tener al menos 2 caracteres",
      })
    );
    return;
  }
  try {
    const requester = await resolveRequester(req);
    const visibilityFilter = buildProductVisibilityFilter(requester);

    const queryWithoutQ = { ...(req.query as Record<string, any>) };
    delete queryWithoutQ.q;

    let searchFilter: any;
    const matchingIds = await findProductIdsBySearchTerm(term);
    if (Array.isArray(matchingIds)) {
      if (matchingIds.length === 0) {
        res.json(
          ApiPaginatedResponse.success({
            data: [],
            message: "Resultados de busqueda",
            pagination: {
              page,
              limit,
              total: 0,
              totalPages: 0,
              next: false,
              prev: page > 1,
            },
          })
        );
        return;
      }
      searchFilter = { id: { in: matchingIds } };
    } else {
      searchFilter = buildFallbackSearchClause(term);
    }

    const where = andWhere(
      searchFilter,
      visibilityFilter,
      buildWhere("product", queryWithoutQ)
    );

    const results = await prisma.product.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        sku: true,
        price: true,
        priceFinal: true,
        images: true,
        stock: true,
        status: true,
        discount: true,
        _count: { select: { review: true } },
         categories: {
          select: {
            id: true,
            name: true,
          },
        },
        relatedProducts: true,
        store: {
          select: { address: true, name: true, id: true },
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

    let favoritesSet: Set<string> | null = null;
    if (requester?.id) {
      favoritesSet = await findFavoriteProductIds(
        requester.id,
        results.map((product) => product.id)
      );
    }

    const data = results.map((product) => ({
      ...product,
      isFavorite: favoritesSet?.has(product.id) ?? false,
    }));

    const total = await prisma.product.count({ where });
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    res.json(
      ApiPaginatedResponse.success({
        data,
        message: "Resultados de busqueda",
        pagination: {
          page,
          limit,
          total,
          totalPages,
          next: page < totalPages,
          prev: page > 1,
        },
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al buscar productos",
        error,
      })
    );
  }
};

export const searchProductsByStore = async (req: Request, res: Response) => {
  const { storeId } = req.params;
  const term = String(req.query.q ?? "").trim();
  const limitParam = Number(req.query.limit ?? 10);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.trunc(limitParam), 1), 30)
    : 10;
  const pageParam = Number(req.query.page ?? 1);
  const page =
    Number.isFinite(pageParam) && pageParam > 0 ? Math.trunc(pageParam) : 1;

  const validStore = IdSchema.safeParse(storeId);
  if (!validStore.success) {
    res
      .status(400)
      .json(ApiResponse.error({ message: "ID de tienda invalido" }));
    return;
  }

  if (term.length < 2) {
    res.status(400).json(
      ApiResponse.error({
        message: "El termino de busqueda debe tener al menos 2 caracteres",
      })
    );
    return;
  }

  try {
    const requester = await resolveRequester(req);

    const store = await prisma.store.findUnique({
      where: { id: validStore.data },
      select: { id: true, ownerId: true, status: true, isDeleted: true },
    });

    if (!store || store.isDeleted) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Tienda no disponible" }));
      return;
    }

    const canViewInactive =
      store.status === "active" || hasStoreVisibility(requester, store.ownerId);

    if (!canViewInactive) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Tienda no disponible" }));
      return;
    }

    const visibilityFilter = buildProductVisibilityFilter(requester);
    const queryWithoutQ = { ...(req.query as Record<string, any>) };
    delete queryWithoutQ.q;

    let searchFilter: any;
    const matchingIds = await findProductIdsBySearchTerm(term, {
      storeId: store.id,
    });
    if (Array.isArray(matchingIds)) {
      if (matchingIds.length === 0) {
        res.json(
          ApiPaginatedResponse.success({
            data: [],
            message: "Resultados de busqueda",
            pagination: {
              page,
              limit,
              total: 0,
              totalPages: 0,
              next: false,
              prev: page > 1,
            },
          })
        );
        return;
      }
      searchFilter = { id: { in: matchingIds } };
    } else {
      searchFilter = buildFallbackSearchClause(term);
    }

    const where = andWhere(
      { storeId: store.id },
      visibilityFilter,
      searchFilter,
      buildWhere("product", queryWithoutQ)
    );

    const results = await prisma.product.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        sku: true,
        price: true,
        priceFinal: true,
        images: true,
        stock: true,
        status: true,
        discount: true,
        _count: { select: { review: true } },
         categories: {
          select: {
            id: true,
            name: true,
          },
        },
        relatedProducts: true,
        store: {
          select: { address: true, name: true, id: true },
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

    let favoritesSet: Set<string> | null = null;
    if (requester?.id) {
      favoritesSet = await findFavoriteProductIds(
        requester.id,
        results.map((product) => product.id)
      );
    }

    const data = results.map((product) => ({
      ...product,
      isFavorite: favoritesSet?.has(product.id) ?? false,
    }));

    const total = await prisma.product.count({ where });
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    res.json(
      ApiPaginatedResponse.success({
        data,
        message: "Resultados de busqueda",
        pagination: {
          page,
          limit,
          total,
          totalPages,
          next: page < totalPages,
          prev: page > 1,
        },
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al buscar productos",
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
          message: "Datos invalidos",
          error: parsed.error.format(),
        })
      );

      return;
    }

    if (!req.user?.id) {
      res
        .status(401)
        .json(ApiResponse.error({ message: "Autenticacion requerida" }));
      return;
    }

    const { categories = [], taxes = [], discountId, ...data } = parsed.data;

    // Validar tienda y ownership
    const store = await prisma.store.findUnique({
      where: { id: data.storeId },
      select: { id: true, ownerId: true },
    });
    if (!store) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "La tienda no existe" }));
      return;
    }

    if (store.ownerId !== req.user.id && req.user.role !== RolesEnum.ADMIN) {
      res
        .status(403)
        .json(
          ApiResponse.error({ message: "No tienes permiso para esta accion" })
        );
      return;
    }

    let applicableDiscount: DiscountSummary | null = null;
    if (discountId) {
      applicableDiscount = await findApplicableDiscount(discountId, store.id);
      if (!applicableDiscount) {
        res.status(400).json(
          ApiResponse.error({
            message: "El descuento no es valido para esta tienda",
          })
        );
        return;
      }
    }

    const finalPrice = computePriceWithDiscount(data.price, applicableDiscount);

    // Crear producto + relaciones (categorías M:N y taxes vía tabla puente)
    const product = await prisma.product.create({
      data: {
        ...data,
        priceFinal: finalPrice,
        discountId: applicableDiscount?.id ?? null,
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

  if (!req.user?.id) {
    res
      .status(401)
      .json(ApiResponse.error({ message: "Autenticacion requerida" }));
    return;
  }

  const validId = IdSchema.safeParse(id);
  if (!validId.success) {
    res
      .status(400)
      .json(ApiResponse.error({ message: "ID de producto invalido" }));
    return;
  }

  const RelatedIdsSchema = z.array(z.string().uuid());
  const parsed = RelatedIdsSchema.safeParse(relatedProductIds ?? []);
  if (!parsed.success) {
    res.status(400).json(
      ApiResponse.error({
        message: "IDs de productos relacionados invalidos",
        error: parsed.error.format(),
      })
    );
    return;
  }

  try {
    const baseProduct = await prisma.product.findUnique({
      where: { id },
      include: {
        store: { select: { id: true, ownerId: true } },
      },
    });

    if (!baseProduct) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Producto base no encontrado" }));
      return;
    }

    if (
      baseProduct.store?.ownerId !== req.user.id &&
      req.user.role !== RolesEnum.ADMIN
    ) {
      res
        .status(403)
        .json(ApiResponse.error({ message: "No autorizado para editar" }));
      return;
    }

    const uniqueIds = Array.from(
      new Set(parsed.data.filter((pid) => pid !== id))
    );

    const existing = uniqueIds.length
      ? await prisma.product.findMany({
          where: {
            id: { in: uniqueIds },
            storeId: baseProduct.storeId,
          },
          select: { id: true },
        })
      : [];

    const existingIds = existing.map((p) => p.id);
    const missingIds = uniqueIds.filter((pid) => !existingIds.includes(pid));

    if (uniqueIds.length > 0 && existingIds.length === 0) {
      res.status(404).json(
        ApiResponse.error({
          message: "No se encontraron productos relacionados validos",
          error: { missingIds: uniqueIds },
        })
      );
      return;
    }

    if (missingIds.length > 0) {
      res.status(400).json(
        ApiResponse.error({
          message: "Algunos productos relacionados no pertenecen a la tienda",
          error: { missingIds },
        })
      );
      return;
    }

    await prisma.product.update({
      where: { id },
      data: {
        relatedProducts: {
          set: existingIds.map((productId) => ({ id: productId })),
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
      .json(ApiResponse.error({ message: "ID de producto invalido" }));
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

  if (existing.store.ownerId !== req?.user?.id) {
    res.status(403).json(ApiResponse.error({ message: "No autorizado" }));
    return;
  }

  // Desestructura UNA vez
  const {
    categories: categoryIds,
    taxes: taxIds,
    discountId,
    sku,
    storeId: incomingStoreId,
    ...rawData
  } = parsed.data as {
    categories?: string[];
    taxes?: string[];
    discountId?: string | null;
    sku?: string | null;
    storeId?: string;
    [k: string]: any;
  };

  // Imagenes nuevas que vienen del cliente (array de strings)
  const imagesProvided = Object.prototype.hasOwnProperty.call(
    parsed.data,
    "images"
  );
  const newImages =
    imagesProvided && Array.isArray(rawData.images)
      ? (rawData.images as string[])
      : undefined;

  // Diferencias (lo que hay que borrar del disco)
  const toDelete =
    imagesProvided && Array.isArray(newImages)
      ? (existing.images ?? []).filter(
          (img) => !(newImages as string[]).includes(img)
        )
      : [];

  if (incomingStoreId !== undefined && incomingStoreId !== existing.storeId) {
    res.status(400).json(
      ApiResponse.error({
        message: "No es posible reasignar la tienda del producto",
      })
    );
    return;
  }

  try {
    const basePrice = parsed.data.price ?? existing.price;
    let finalDiscountId =
      discountId === undefined ? existing.discountId : discountId;

    let discountInfo: DiscountSummary | null = null;
    if (finalDiscountId) {
      discountInfo = await findApplicableDiscount(
        finalDiscountId,
        existing.storeId
      );
      if (!discountInfo) {
        if (discountId === undefined) {
          finalDiscountId = null;
        } else {
          res.status(400).json(
            ApiResponse.error({
              message: "El descuento no es valido para esta tienda",
            })
          );
          return;
        }
      }
    }

    finalDiscountId = discountInfo?.id ?? finalDiscountId ?? null;

    const finalPrice = computePriceWithDiscount(basePrice, discountInfo);

    const updated = await prisma.$transaction(async (tx) => {
      const payload: Record<string, unknown> = {
        ...rawData,
        priceFinal: finalPrice,
        discountId: finalDiscountId,
      };

      if (sku !== undefined) {
        payload.sku =
          sku === null || (typeof sku === "string" && sku.trim() === "")
            ? null
            : sku;
      }

      // Reemplaza categorias si se envian
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

      // Devolver producto actualizado
      return tx.product.findUnique({
        where: { id },
        include: {
          categories: true,
          taxes: { include: { tax: true } },
          relatedProducts: true,
        },
      });
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

    if (product.store.ownerId !== req?.user?.id) {
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
          select: { status: true, isDeleted: true, ownerId: true,address: true, name: true, id: true  },
        },
         categories: {
          select: {
            id: true,
            name: true,
          },
        },
        discount: true,
        _count: { select: { review: true } },
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

    let favoritesSet: Set<string> | null = null;
    if (requester?.id) {
      favoritesSet = await findFavoriteProductIds(
        requester.id,
        product.relatedProducts.map((related) => related.id)
      );
    }

    const related = product.relatedProducts.map((relatedProduct) => ({
      ...relatedProduct,
      isFavorite: favoritesSet?.has(relatedProduct.id) ?? false,
    }));

    res.json(
      ApiResponse.success({
        data: related,
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

export const getFeaturedProductsController = async (
  req: Request,
  res: Response
) => {
  const limit = Number(req.query.limit ?? 10);
  try {
    const requester = await resolveRequester(req);
    const page = Number(req.query.page ?? 1);
    const size = Math.min(Math.max(limit, 1), 50);

    const baseQuery = {
      where: {
        status: "active" as const,
        store: { status: "active", isDeleted: false },
      },
      include: {
        discount: true,
        _count: { select: { review: true } },
         categories: {
          select: {
            id: true,
            name: true,
          },
        },
        relatedProducts: true,
        store: {
          select: { address: true, name: true, id: true },
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
    };

    const featuredResult = await paginate({
      model: prisma.product,
      query: { page: String(page), limit: String(size) },
      where: { ...baseQuery.where, isFeatured: true },
      include: baseQuery.include,
    });

    let products = featuredResult.data;
    let pagination = featuredResult.pagination;

    if (products.length === 0) {
      const fallbackResult = await paginate({
        model: prisma.product,
        query: { page: String(page), limit: String(size) },
        where: baseQuery.where,
        include: baseQuery.include,
        orderBy: [
          { orderItem: { _count: "desc" } },
          { review: { _count: "desc" } },
          { updatedAt: "desc" },
        ],
      });

      products = fallbackResult.data;
      pagination = fallbackResult.pagination;
    }

    let favoritesSet: Set<string> | null = null;
    if (requester?.id) {
      favoritesSet = await findFavoriteProductIds(
        requester.id,
        products.map((product: any) => product.id)
      );
    }

    const enriched = products.map((product: any) => ({
      ...product,
      totalOrders: product.orderItem?.reduce(
        (acc: number, item: any) => acc + item.quantity,
        0
      ),
      ratingAverage:
        product.review?.length > 0
          ? product.review.reduce(
              (acc: number, review: any) => acc + review.rating,
              0
            ) / product.review.length
          : 0,
      isFavorite: favoritesSet?.has(product.id) ?? false,
    }));

    res.json(
      ApiPaginatedResponse.success({
        data: enriched,
        pagination,
        message: "Productos destacados",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al obtener productos destacados",
        error,
      })
    );
  }
};
