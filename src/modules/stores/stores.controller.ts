import type { Request, Response } from "express";
import prisma from "../../database/prisma";
import { ApiResponse } from "../../core/responses/ApiResponse";
import { RolesEnum } from "../../core/enums";
import { paginate } from "../../utils/pagination";
import { ApiPaginatedResponse } from "../../core/responses/ApiPaginatedResponse";
import { deleteImage } from "../../core/services/image-service";
import { updateStoreSchema } from "../../core/validations/stores";
import { validateCreateStore } from "./validator";
import { ownerPublicSelect, storePublicSelect } from "./storePublicSelect";
import { IdSchema } from "../products/validator";
import { andWhere, buildWhere } from "../../utils";
import {
  notifyStoreCreated,
  notifyStoreStatusChange,
} from "../../core/services/storeNotificationService";

const mapStoreMetrics = (store: any) => {
  const { reviews = [], orders = [], ...rest } = store;
  const ratingsCount = reviews.length;
  const ratingAverage = ratingsCount
    ? Number(
        (
          reviews.reduce(
            (acc: number, review: { rating: number }) => acc + review.rating,
            0
          ) / ratingsCount
        ).toFixed(2)
      )
    : null;
  const salesCount = orders.length;

  return {
    ...rest,
    metrics: {
      ratingAverage,
      ratingsCount,
      salesCount,
    },
  };
};

const sortStoresByMetrics = (
  a: ReturnType<typeof mapStoreMetrics>,
  b: ReturnType<typeof mapStoreMetrics>
) => {
  const ratingA = a.metrics.ratingAverage ?? 0;
  const ratingB = b.metrics.ratingAverage ?? 0;
  if (ratingA !== ratingB) return ratingB - ratingA;
  return b.metrics.salesCount - a.metrics.salesCount;
};

export const createStore = async (req: Request, res: Response) => {
  // req.user debe venir del middleware de auth
  if (!req.user?.id) {
    res.status(401).json({ message: "No autenticado" });
    return;
  }

  const { id, role } = req.user;

  // 1) Validación + normalización
  const parsed = validateCreateStore(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json(
        ApiResponse.error({ message: "Datos inválidos", error: parsed.errors })
      );
    return;
  }
  const data = parsed.data;

  // 2) Determinar ownerId (si no eres admin, siempre el actor)
  const isAdmin = role === RolesEnum.ADMIN;
  const ownerId = isAdmin && data.ownerId ? data.ownerId : id;

  try {
    // 3) Verificar que NO tenga ya tienda (ownerId es único)
    const existing = await prisma.store.findUnique({ where: { ownerId } });
    if (existing) {
      res.status(409).json(
        ApiResponse.error({
          message: "Ya existe una tienda para este usuario",
        })
      );
      return;
    }

    // 4) Crear tienda
    const store = await prisma.store.create({
      data: {
        ...data,
        ownerId,
        status: "pending",
      },
      select: storePublicSelect,
    });

    // 5) Si el dueño era buyer, promuévelo a seller (no cambies admin/support)
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: {
        role: true,
        email: true,
        firstName: true,
        username: true,
      },
    });

    if (owner?.role === RolesEnum.BUYER) {
      await prisma.user.update({
        where: { id: ownerId },
        data: { role: RolesEnum.SELLER },
      });
    }

    notifyStoreCreated({
      to: owner?.email,
      firstName: owner?.firstName,
      fallbackName: owner?.username ?? store.name,
      storeName: store.name ?? "Tu tienda",
    }).catch((error) =>
      console.error("[mail] Error al notificar creación de tienda", error)
    );

    res
      .status(201)
      .json(ApiResponse.success({ message: "Tienda creada", data: store }));
  } catch (error: any) {
    if (error?.code === "P2002") {
      res.status(409).json(
        ApiResponse.error({
          message: "Ya existe una tienda para este usuario",
        })
      );
      return;
    }
    res.status(500).json(
      ApiResponse.error({
        message: "Error al crear la tienda",
        error: error?.message ?? String(error),
      })
    );
  }
};

export const getStore = async (req: Request, res: Response) => {
  const { id } = req.params;

  // 1) validar id (uuid)
  const parsed = IdSchema.safeParse(id);

  if (!parsed.success) {
    res.status(400).json(ApiResponse.error({ message: "ID inválido" }));
    return;
  }

  try {
    const store = await prisma.store.findUnique({
      where: { id, isDeleted: false, status: { not: "deleted" } as any },
      select: {
        ...storePublicSelect,
        owner: { select: ownerPublicSelect },
        _count: { select: { products: true, reviews: true } },
      },
    });

    if (!store) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Tienda no encontrada" }));
      return;
    }

    res.json(ApiResponse.success({ data: store }));
  } catch (error: any) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al obtener tienda",
        error: error?.message ?? String(error),
      })
    );
  }
};

export const getFeaturedStores = async (_req: Request, res: Response) => {
  try {
    const baseWhere = {
      isDeleted: false,
      status: "active" as const,
      products: { some: { status: "active" as const } },
    };

    const selection = {
      ...storePublicSelect,
      reviews: { select: { rating: true } },
      orders: {
        where: { status: "completed" },
        select: {
          id: true,
          items: { select: { productId: true, quantity: true } },
        },
      },
    } as const;

    const now = new Date();
    const featuredRaw = await prisma.store.findMany({
      where: {
        ...baseWhere,
        isFeatured: true,
        OR: [{ featuredUntil: null }, { featuredUntil: { gte: now } }],
      },
      take: 10,
      select: { ...selection, _count: { select: { reviews: true } } },
    });

    const computeBestSellerIds = (store: (typeof featuredRaw)[number]) => {
      const productSales = new Map<string, number>();

      for (const order of store.orders ?? []) {
        for (const item of order.items ?? []) {
          const key = item.productId;
          const qty = Number(item.quantity ?? 0);
          if (!key || Number.isNaN(qty) || qty <= 0) continue;
          productSales.set(key, (productSales.get(key) ?? 0) + qty);
        }
      }

      return Array.from(productSales.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([productId]) => productId);
    };

    const fetchProductSummaries = async (productIds: string[]) => {
      if (productIds.length === 0) return [];
      const products = await prisma.product.findMany({
        where: { id: { in: productIds }, status: "active" },
        select: {
          id: true,
          name: true,
          price: true,
          priceFinal: true,
          images: true,
        },
      });
      const byId = new Map(products.map((product) => [product.id, product]));
      return productIds
        .map((id) => byId.get(id))
        .filter((product): product is (typeof products)[number] =>
          Boolean(product)
        );
    };

    const fetchLatestProducts = async (
      storeId: string,
      excludeIds: string[],
      limit: number
    ) => {
      if (limit <= 0) return [];
      const products = await prisma.product.findMany({
        where: {
          storeId,
          status: "active",
          id: excludeIds.length ? { notIn: excludeIds } : undefined,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          name: true,
          price: true,
          priceFinal: true,
          images: true,
        },
      });
      return products;
    };

    const buildFeaturedPayload = async (stores: typeof featuredRaw) => {
      const prepared = stores
        .map((store) => ({
          raw: store,
          metrics: mapStoreMetrics(store),
        }))
        .sort((a, b) => sortStoresByMetrics(a.metrics, b.metrics));

      const enriched = await Promise.all(
        prepared.map(async ({ raw, metrics }) => {
          const bestsellerIds = computeBestSellerIds(raw);
          const bestsellingProducts = await fetchProductSummaries(
            bestsellerIds
          );
          const missingSlots = Math.max(0, 3 - bestsellingProducts.length);
          const fallbackProducts = await fetchLatestProducts(
            raw.id,
            bestsellerIds,
            missingSlots
          );

          const combined = [...bestsellingProducts, ...fallbackProducts].slice(
            0,
            3
          );

          return {
            ...metrics,
            products: combined,
          };
        })
      );

      return enriched;
    };

    if (featuredRaw.length > 0) {
      const data = await buildFeaturedPayload(featuredRaw);
      res.json(
        ApiResponse.success({
          data,
          message: "Tiendas destacadas",
        })
      );
      return;
    }

    const fallbackRaw = await prisma.store.findMany({
      where: baseWhere,
      take: 10,
      select: selection,
    });

    const data = await buildFeaturedPayload(fallbackRaw);

    res.json(
      ApiResponse.success({
        data,
        message:
          "Tiendas destacadas no disponibles, mostrando las mejor valoradas",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al obtener tiendas destacadas",
        error,
      })
    );
  }
};

export const getPublicStores = async (req: Request, res: Response) => {
  try {
    const result = await paginate({
      model: prisma.store,
      query: req.query,
      orderBy: { createdAt: "desc" },
      where: andWhere(
        {
          status: "active",
          isDeleted: false,
        },
        buildWhere("store", req.query)
      ),
      select: {
        id: true,
        name: true,
        tagline: true,
        description: true,
        logo: true,
        banner: true,
        status: true,
        isFeatured: true,
        featuredUntil: true,
        businessHours: true,
        keywords: true,
        metaTitle: true,
        metaDesc: true,
        _count: { select: { products: true, reviews: true } },
      },
    });

    res.json(ApiPaginatedResponse.success(result));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al obtener tiendas",
        error,
      })
    );
  }
};

export const getAllStores = async (req: Request, res: Response) => {
  try {
    const result = await paginate({
      model: prisma.store,
      query: req.query,
      orderBy: { createdAt: "desc" },
      where: andWhere(
        { isDeleted: false, status: { not: "deleted" } as any },
        buildWhere("store", req.query)
      ),
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
        _count: { select: { products: true, reviews: true } },
      },
    });
    res.json(ApiPaginatedResponse.success(result));
  } catch (error) {
    res
      .status(500)
      .json(ApiResponse.error({ message: "Error al obtener tiendas", error }));
  }
};

//actualizar tienda solo por seller
export const updateStore = async (req: Request, res: Response) => {
  const { id } = req.params;

  const parsed = IdSchema.safeParse(id);

  if (!parsed.success) {
    res.status(400).json(ApiResponse.error({ message: "ID inválido" }));
    return;
  }

  // 1) Validar body
  const validatedStore = updateStoreSchema.safeParse(req.body);

  if (!validatedStore.success) {
    res.status(400).json(
      ApiResponse.error({
        message: "Datos inválidos",
        error: validatedStore.error.flatten().fieldErrors,
      })
    );
    return;
  }

  // 2) Autorización: owner o admin
  const store = await prisma.store.findUnique({
    where: { id },
    select: { ownerId: true, isDeleted: true, status: true },
  });

  if (!store) {
    res
      .status(404)
      .json(ApiResponse.error({ message: "Tienda no encontrada" }));
    return;
  }

  if (store.isDeleted || store.status === "deleted") {
    res.status(409).json(ApiResponse.error({ message: "Tienda eliminada" }));
    return;
  }

  try {
    // console.log("DATA A ACTUALIZAR", validatedStore.data, req.body);
    const updated = await prisma.store.update({
      where: { id, isDeleted: false, status: { not: "deleted" } },
      data: req.body,
      select: storePublicSelect,
    });

    res.json(
      ApiResponse.success({
        message: "Tienda actualizada",
        data: updated,
      })
    );
  } catch (e: any) {
    if (e?.code === "P2025") {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Tienda no encontrada" }));
      return;
    }
    res.status(500).json(
      ApiResponse.error({
        message: "Error al actualizar tienda",
        error: e?.message || String(e),
      })
    );
  }
};

//actualizar status solo por admin
export const updateStoreStatus = async (req: Request, res: Response) => {
  const { storeId } = req.params;
  const { status } = req.body;

  const validStatuses = ["pending", "active", "inactive", "banned", "deleted"];

  if (!validStatuses.includes(status)) {
    res.status(400).json(
      ApiResponse.error({
        message: "Estado de tienda inválido",
      })
    );
    return;
  }

  try {
    const store = await prisma.store.update({
      where: { id: storeId },
      data: { status },
      include: {
        owner: {
          select: {
            email: true,
            firstName: true,
            username: true,
          },
        },
      },
    });

    // Notify owner without blocking the response
    notifyStoreStatusChange({
      to: store.owner.email,
      firstName: store.owner.firstName,
      fallbackName: store.owner.username,
      storeName: store.name,
      status: store.status,
    }).catch((err) => {
      console.error("[MAIL_ERROR] Failed to send status change email:", err);
    });

    res.json(
      ApiResponse.success({
        data: store,
        message: "Estado de la tienda actualizado correctamente",
      })
    );
  } catch (error: any) {
    if (error?.code === "P2025") {
      res.status(404).json(
        ApiResponse.error({
          message: "La tienda no fue encontrada.",
        })
      );
      return;
    }
    res.status(500).json(
      ApiResponse.error({
        message: "Error al actualizar el estado de la tienda",
        error: error?.message ?? String(error),
      })
    );
  }
};

//borrar tienda
export const deleteStore = async (req: Request, res: Response) => {
  const { storeId } = req.params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const store = await tx.store.update({
        where: { id: storeId, isDeleted: false },
        data: { isDeleted: true, status: "deleted" },
      });

      const updatedUser = await tx.user.update({
        where: { id: store.ownerId },
        data: { role: RolesEnum.BUYER },
      });

      return { store, updatedUser };
    });

    res.json(
      ApiResponse.success({
        data: result.store,
        message:
          "La tienda ha sido eliminada y el rol del propietario ha sido actualizado a comprador.",
      })
    );
  } catch (error: any) {
    // Handle Prisma's not-found error specifically
    if (error?.code === "P2025") {
      res.status(404).json(
        ApiResponse.error({
          message: "La tienda no fue encontrada o ya ha sido eliminada.",
        })
      );
      return;
    }
    res.status(500).json(
      ApiResponse.error({
        message: "Error al eliminar la tienda",
        error: error?.message ?? String(error),
      })
    );
  }
};

export const uploadStoreImages = async (req: Request, res: Response) => {
  const { logo, banner } = req.body;
  const user = req.user;

  if (!banner && !logo) {
    res.status(400).json({
      success: false,
      message: "Debe proporcionar al menos una imagen",
    });
    return;
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: user?.id },
      include: { store: true },
    });

    if (!existingUser || !existingUser.store) {
      res
        .status(404)
        .json({ success: false, message: "Usuario o tienda no encontrada" });
      return;
    }

    const updateData: any = {};

    if (logo) {
      if (existingUser.store.logo) {
        await deleteImage(existingUser.store.logo);
      }
      updateData.logo = logo;
    }

    if (banner) {
      if (existingUser.store.banner) {
        await deleteImage(existingUser.store.banner);
      }
      updateData.banner = banner;
    }

    await prisma.store.update({
      where: {
        id: existingUser.store.id,
        ownerId: user?.id,
      },
      data: updateData,
    });

    const updatedFields = [];
    if (logo) updatedFields.push("logo");
    if (banner) updatedFields.push("banner");

    res.json(
      ApiResponse.success({
        message: `Imagen${updatedFields.length > 1 ? "es" : ""} actualizada${
          updatedFields.length > 1 ? "s" : ""
        }: ${updatedFields.join(" y ")}`,
      })
    );
    return;
  } catch (error) {
    console.error("Error al actualizar imagen de tienda", error);
    res.status(500).json({
      success: false,
      message: "Error inesperado al actualizar la imagen",
    });
    return;
  }
};

//restaurar tienda
export const restoreStore = async (req: Request, res: Response) => {
  const { storeId } = req.params;
  const { role } = req.user;

  // Authorization: only admins can restore stores
  if (role !== RolesEnum.ADMIN) {
    res.status(403).json(
      ApiResponse.error({
        message:
          "Acción no autorizada. Solo los administradores pueden restaurar tiendas.",
      })
    );
    return;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({
        where: { id: storeId },
        select: { ownerId: true, isDeleted: true },
      });

      if (!store || !store.isDeleted) {
        // This will cause the transaction to rollback
        throw new Error("La tienda no fue encontrada o no ha sido eliminada.");
      }

      const restoredStore = await tx.store.update({
        where: { id: storeId },
        data: { isDeleted: false, status: "inactive" },
      });

      const owner = await tx.user.findUnique({ where: { id: store.ownerId } });

      // Only promote to seller if they are currently a buyer
      if (owner?.role === RolesEnum.BUYER) {
        await tx.user.update({
          where: { id: store.ownerId },
          data: { role: RolesEnum.SELLER },
        });
      }

      return { store: restoredStore };
    });

    res.json(
      ApiResponse.success({
        data: result.store,
        message:
          "La tienda ha sido restaurada y el rol del propietario ha sido actualizado a vendedor si era necesario.",
      })
    );
  } catch (error: any) {
    if (
      error.message === "La tienda no fue encontrada o no ha sido eliminada."
    ) {
      res.status(404).json(ApiResponse.error({ message: error.message }));
      return;
    }
    res.status(500).json(
      ApiResponse.error({
        message: "Error al restaurar la tienda",
        error: error?.message ?? String(error),
      })
    );
  }
};
