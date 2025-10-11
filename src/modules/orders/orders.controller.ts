import type { Request, Response } from "express";

import { RolesEnum } from "../../core/enums";
import { ApiPaginatedResponse } from "../../core/responses/ApiPaginatedResponse";
import { ApiResponse } from "../../core/responses/ApiResponse";
import prisma from "../../database/prisma";
import { andWhere } from "../../utils";
import { paginate } from "../../utils/pagination";
import {
  CreateOrderSchema,
  IdSchema,
  OrderQuerySchema,
  UpdateOrderStatusSchema,
} from "./validator";
import type { OrderItem, OrderStatus } from "@prisma/client";
import { notifyOrderStatusChange } from "../../core/services/notificationService";

const mapValidationError = (result: any) => {
  if (result.success) return null;
  const issue = result.error?.issues?.[0];
  const message = issue?.message ?? "Datos invalidos";
  return ApiResponse.error({ message, error: result.error.flatten() });

  // if (!parsed.success) {
  //   res.status(400).json(ApiResponse.error({ message: "ID inválido" }));
  //   return;
  // }
};

const ORDER_INCLUDE = {
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          price: true,
          priceFinal: true,
          images: true,
        },
      },
    },
  },
  store: {
    select: {
      id: true,
      name: true,
      ownerId: true,
    },
  },
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
} as const;

const isSupportRole = (role?: RolesEnum | null) =>
  role === RolesEnum.ADMIN || role === RolesEnum.SUPPORT;

export const listOrders = async (req: Request, res: Response) => {
  const requester = req.user;
  if (!requester || !isSupportRole(requester.role as RolesEnum)) {
    res.status(403).json(ApiResponse.error({ message: "Acceso denegado" }));
    return;
  }

  const parsed = OrderQuerySchema.safeParse(req.query);
  if (!parsed.success && parsed.error.issues.length > 0) {
    const errorResponse = mapValidationError(parsed);
    res.status(400).json(errorResponse);
    return;
  }

  const filters = parsed.success ? parsed.data : {};

  try {
    const result = await paginate({
      model: prisma.order,
      query: req.query,
      where: andWhere(
        filters.status ? { status: filters.status } : undefined,
        filters.storeId ? { storeId: filters.storeId } : undefined,
        filters.userId ? { userId: filters.userId } : undefined
      ),
      include: ORDER_INCLUDE,
    });

    res.json(
      ApiPaginatedResponse.success({
        data: result.data,
        pagination: result.pagination,
        message: "Listado de ordenes",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudieron obtener las ordenes",
        error,
      })
    );
  }
};

export const listMyOrders = async (req: Request, res: Response) => {
  const requester = req.user;

  if (!requester?.id) {
    res
      .status(401)
      .json(ApiResponse.error({ message: "Usuario no autenticado" }));
    return;
  }

  const parsed = OrderQuerySchema.partial().safeParse(req.query);
  if (!parsed.success && parsed.error.issues.length > 0) {
    const errorResponse = mapValidationError(parsed);
    res.status(400).json(errorResponse);
    return;
  }

  const filters = parsed.success ? parsed.data : {};
  const requesterRole = requester.role as RolesEnum | undefined;
  const supportView = isSupportRole(requesterRole);

  if (supportView) {
    try {
      const result = await paginate({
        model: prisma.order,
        query: req.query,
        where: andWhere(
          filters.status ? { status: filters.status } : undefined,
          filters.storeId ? { storeId: filters.storeId } : undefined,
          filters.userId ? { userId: filters.userId } : undefined
        ),
        include: ORDER_INCLUDE,
      });

      res.json(
        ApiPaginatedResponse.success({
          data: result.data,
          pagination: result.pagination,
          message: "Ordenes del usuario",
        })
      );
      return;
    } catch (error) {
      res.status(500).json(
        ApiResponse.error({
          message: "No se pudieron obtener las ordenes",
          error,
        })
      );
      return;
    }
  }

  const ownsStore = requester.store?.ownerId === requester.id;
  const ownerStoreId = ownsStore ? requester.store?.id : undefined;

  if (filters.storeId && (!ownerStoreId || filters.storeId !== ownerStoreId)) {
    res.status(403).json(ApiResponse.error({ message: "Acceso denegado" }));
    return;
  }

  const clauses = new Array<Record<string, unknown>>();

  if (filters.status) {
    clauses.push({ status: filters.status });
  }

  if (filters.storeId) {
    clauses.push({ storeId: filters.storeId });
  }

  const visibilityConditions: Record<string, string>[] = [
    { userId: requester.id },
  ];

  if (ownerStoreId) {
    visibilityConditions.push({ storeId: ownerStoreId });
  }

  clauses.push({ OR: visibilityConditions });

  try {
    const where = andWhere(...(clauses as Array<Record<string, unknown>>));

    const result = await paginate({
      model: prisma.order,
      query: req.query,
      where,
      include: ORDER_INCLUDE,
    });

    res.json(
      ApiPaginatedResponse.success({
        data: result.data,
        pagination: result.pagination,
        message: "Ordenes del usuario",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudieron obtener las ordenes",
        error,
      })
    );
  }
};

export const listStoreOrders = async (req: Request, res: Response) => {
  const requester = req.user;

  if (
    !requester?.id ||
    requester.role !== RolesEnum.SELLER ||
    !requester.store
  ) {
    res.status(403).json(ApiResponse.error({ message: "Acceso denegado" }));
    return;
  }

  const parsed = OrderQuerySchema.pick({ status: true })
    .partial()
    .safeParse(req.query);
  if (!parsed.success && parsed.error.issues.length > 0) {
    const errorResponse = mapValidationError(parsed);
    res.status(400).json(errorResponse);
    return;
  }

  const filters = parsed.success ? parsed.data : {};
  const storeId = requester.store.id;

  try {
    const result = await paginate({
      model: prisma.order,
      query: req.query,
      where: andWhere(
        { storeId },
        filters.status ? { status: filters.status } : undefined
      ),
      include: ORDER_INCLUDE,
    });

    res.json(
      ApiPaginatedResponse.success({
        data: result.data,
        pagination: result.pagination,
        message: "Ordenes de la tienda",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudieron obtener las ordenes",
        error,
      })
    );
  }
};

export const getOrderById = async (req: Request, res: Response) => {
  const params = IdSchema.safeParse(req.params);
  const errorResponse = mapValidationError(params);
  if (errorResponse) {
    res.status(400).json(errorResponse);
    return;
  }

  const requester = req.user;
  if (!requester?.id) {
    res
      .status(401)
      .json(ApiResponse.error({ message: "Usuario no autenticado" }));
    return;
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: params?.data?.id },
      include: ORDER_INCLUDE,
    });

    if (!order) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Orden no encontrada" }));
      return;
    }

    const isOwner = order.userId === requester.id;
    const isStoreOwner = order.store?.ownerId === requester.id;
    const canView =
      isOwner || isStoreOwner || isSupportRole(requester.role as RolesEnum);

    if (!canView) {
      res.status(403).json(ApiResponse.error({ message: "Acceso denegado" }));
      return;
    }

    res.json(
      ApiResponse.success({
        data: order,
        message: "Orden obtenida",
      })
    );
  } catch (error) {
    res
      .status(500)
      .json(
        ApiResponse.error({ message: "No se pudo obtener la orden", error })
      );
  }
};

export const createOrder = async (req: Request, res: Response) => {
  const parsed = CreateOrderSchema.safeParse(req.body);
  const errorResponse = mapValidationError(parsed);
  if (errorResponse) {
    res
      .status(400)
      .json(
        ApiResponse.error({ message: "Datos invalidos", error: errorResponse })
      );
    return;
  }

  const requester = req.user;
  if (!requester?.id) {
    res
      .status(401)
      .json(ApiResponse.error({ message: "Usuario no autenticado" }));
    return;
  }

  const payload = parsed.data;
  const actingRole = requester.role as RolesEnum | undefined;
  const isAdminOrSupport = isSupportRole(actingRole);
  const targetUserId = payload?.userId ?? requester.id;

  if (
    payload?.userId &&
    !isAdminOrSupport &&
    payload?.userId !== requester.id
  ) {
    res.status(403).json(
      ApiResponse.error({
        message: "No tienes permisos para crear ordenes para otro usuario",
      })
    );
    return;
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({
        where: { id: payload?.storeId },
        select: { id: true, status: true },
      });

      if (!store) {
        throw new Error("La tienda indicada no existe");
      }

      const productIds = payload?.items.map((item) => item.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          price: true,
          priceFinal: true,
          stock: true,
          storeId: true,
          name: true,
          sku: true,
          discount: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      });

      if (products.length !== payload?.items.length) {
        throw new Error("Algunos productos no existen");
      }

      const productMap = new Map(
        products.map((product) => [product.id, product])
      );

      let subtotal = 0;
      let productDiscountTotal = 0;
      const orderItemsData: Array<{
        productId: string;
        quantity: number;
        unitPrice: number;
        unitPriceFinal: number;
        lineSubtotal: number;
        lineDiscount: number;
      }> = [];
      const discountAdjustments = new Map<
        string,
        { type: string; name: string; amount: number; discountId?: string }
      >();

      for (const item of payload?.items) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new Error("Producto no encontrado");
        }

        if (product.storeId !== payload?.storeId) {
          throw new Error(
            `El producto ${product.name} pertenece a otra tienda`
          );
        }

        if (product.stock < item.quantity) {
          throw new Error(
            `Stock insuficiente para ${product.name}: disponible ${product.stock}`
          );
        }

        const unitPrice = product.price ?? 0;
        const unitPriceFinal = product.priceFinal ?? unitPrice;
        const lineSubtotal = unitPrice * item.quantity;
        const lineDiscount =
          Math.max(unitPrice - unitPriceFinal, 0) * item.quantity;

        subtotal += lineSubtotal;
        productDiscountTotal += lineDiscount;

        if (lineDiscount > 0 && product.discount) {
          const key = product.discount.id;
          const current = discountAdjustments.get(key) ?? {
            type: "discount",
            name: product.discount.name,
            amount: 0,
            discountId: product.discount.id,
          };
          current.amount += lineDiscount;
          discountAdjustments.set(key, current);
        }

        orderItemsData.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice,
          unitPriceFinal,
          lineSubtotal,
          lineDiscount,
        });
      }

      if (subtotal <= 0) {
        throw new Error("El total de la orden debe ser mayor a cero");
      }

      // --- Lógica de Promoción y Cálculo Final ---
      let promotionDiscount = 0;
      let finalPromotionId: string | undefined = undefined;
      let promotionCodeUsed: string | undefined = undefined;
      const priceAdjustments: Array<Record<string, unknown>> = Array.from(
        discountAdjustments.values()
      );

      if (payload?.promotionCode) {
        const promotion = await tx.promotion.findFirst({
          where: {
            code: payload?.promotionCode,
            status: "active",
            startsAt: { lte: new Date() },
            endsAt: { gte: new Date() },
          },
          select: {
            id: true,
            value: true,
            code: true,
            name: true,
          },
        });

        if (!promotion) {
          throw new Error("El código de promoción no es válido o ha expirado.");
        }

        // Asumimos que las promociones de cupón son porcentuales por ahora
        if (promotion.value && promotion.value > 0) {
          promotionDiscount = (subtotal * promotion.value) / 100;
          finalPromotionId = promotion.id;
          promotionCodeUsed = promotion.code ?? payload.promotionCode;
          priceAdjustments.push({
            type: "promotion",
            code: promotionCodeUsed,
            name: promotion.name,
            amount: promotionDiscount,
          });
        }
      }

      // TODO: Lógica para calcular taxAmount y shippingAmount
      const taxAmount = 0;
      const shippingAmount = 0;

      const totalDiscountAmount = productDiscountTotal + promotionDiscount;
      const total = subtotal - totalDiscountAmount + taxAmount + shippingAmount;

      // Actualizar stock
      for (const item of payload?.items) {
        const product = productMap.get(item.productId)!;
        await tx.product.update({
          where: { id: product.id },
          data: { stock: product.stock - item.quantity },
        });
      }

      const created = await tx.order.create({
        data: {
          userId: targetUserId,
          storeId: payload?.storeId,
          subtotal,
          totalDiscountAmount,
          taxAmount,
          shippingAmount,
          total,
          status: "pending",
          shippingAddress: payload?.shippingAddress ?? undefined,
          shippingMethod: payload?.shippingMethod ?? undefined,
          promotionId: finalPromotionId,
          promotionCodeUsed,
          priceAdjustments:
            priceAdjustments.length > 0 ? priceAdjustments : undefined,
          items: {
            create: orderItemsData,
          },
        },
        include: ORDER_INCLUDE,
      });

      return created;
    });

    res.status(201).json(
      ApiResponse.success({
        data: order,
        message: "Orden creada exitosamente",
      })
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo crear la orden";

    const knownIssues = [
      "La tienda indicada no existe",
      "Algunos productos no existen",
      "Producto no encontrado",
      "Stock insuficiente",
      "pertenece a otra tienda",
      "El total de la orden debe ser mayor a cero",
    ];

    const isClientError = knownIssues.some((text) => message.includes(text));

    res.status(isClientError ? 400 : 500).json(
      ApiResponse.error({
        message,
        error,
      })
    );
  }
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  const params = IdSchema.safeParse(req.params);
  const body = UpdateOrderStatusSchema.safeParse(req.body);

  const paramsError = mapValidationError(params);
  if (paramsError) {
    res.status(400).json(paramsError);
    return;
  }

  const bodyError = mapValidationError(body);
  if (bodyError) {
    res.status(400).json(bodyError);
    return;
  }

  const requester = req.user;
  if (!requester?.id) {
    res
      .status(401)
      .json(ApiResponse.error({ message: "Usuario no autenticado" }));
    return;
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: params?.data?.id },
      include: {
        store: { select: { ownerId: true } },
      },
    });

    if (!order) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Orden no encontrada" }));
      return;
    }

    const isOwner = order.store?.ownerId === requester.id;
    const canUpdate = isOwner || isSupportRole(requester.role as RolesEnum);

    if (!canUpdate) {
      res.status(403).json(ApiResponse.error({ message: "Acceso denegado" }));
      return;
    }

    const updated = await prisma.order.update({
      where: { id: params?.data?.id },
      data: { status: body?.data?.status as OrderStatus },
      include: ORDER_INCLUDE,
    });

    notifyOrderStatusChange({
      to: updated.user?.email,
      firstName: updated.user?.firstName,
      orderId: updated.id,
      orderCode: updated.id,
      status: updated.status,
    }).catch((error) =>
      console.error(
        "[mail] No se pudo enviar la notificacion de estado de orden",
        error
      )
    );

    res.json(
      ApiResponse.success({
        data: updated,
        message: "Estado actualizado",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo actualizar la orden",
        error,
      })
    );
  }
};
