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
import {
  applyProductDiscounts,
  calculateCartTotals,
  calculateProductTax,
  roundCurrency,
  type CouponRule,
  type ProductDiscountRule,
  type ProductPricingResult,
  type TaxRule,
} from "./pricing-engine";
import { notifyOrderStatusChange, notifyOrderCreated } from "../../core/services/notificationService";

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
      phone: true
    },
  },
  shippingMethod: {
    select: {
      id: true,
      name: true,
      description: true,
      cost: true,
      status: true,
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

      let selectedShippingMethod: { id: string; cost: number } | null = null;

      if (payload?.shippingMethodId) {
        const shippingMethod = await tx.shippingMethod.findFirst({
          where: {
            id: payload.shippingMethodId,
            storeId: payload.storeId,
            isDeleted: false,
            status: "active",
          },
          select: { id: true, cost: true },
        });

        if (!shippingMethod) {
          throw new Error("El método de envío seleccionado ya no está disponible.");
        }

        selectedShippingMethod = shippingMethod;
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
              value: true,
              status: true,
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
                  status: true,
                },
              },
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

      const precision = 2;
      const orderItemsData: Array<{
        productId: string;
        quantity: number;
        unitPrice: number;
        unitPriceFinal: number;
        lineSubtotal: number;
        lineDiscount: number;
      }> = [];
      const productCalculations: ProductPricingResult[] = [];

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

        const quantity = item.quantity;
        const unitPrice = product.price ?? 0;
        const lineBaseAmount = roundCurrency(unitPrice * quantity, precision);

        const discountRules: ProductDiscountRule[] = [];
        if (
          product.discount &&
          product.discount.status === "active" &&
          typeof product.discount.value === "number" &&
          product.discount.value > 0
        ) {
          discountRules.push({
            id: product.discount.id,
            label: product.discount.name,
            type: product.discount.type,
            value: product.discount.value,
          });
        } else if (
          product.priceFinal !== null &&
          product.priceFinal !== undefined &&
          product.priceFinal < unitPrice
        ) {
          const difference = roundCurrency(unitPrice - product.priceFinal, precision);
          if (difference > 0) {
            discountRules.push({
              type: "fixed",
              value: difference,
              label: "Ajuste manual",
            });
          }
        }

        const discountResult = applyProductDiscounts({
          productId: product.id,
          storeId: product.storeId,
          basePrice: unitPrice,
          quantity,
          discounts: discountRules,
          precision,
        });

        const unitNetPrice = discountResult.unitPrice;
        const lineDiscountTotal = roundCurrency(
          discountResult.discountTotal * quantity,
          precision
        );
        const lineNetAmount = roundCurrency(
          Math.max(lineBaseAmount - lineDiscountTotal, 0),
          precision
        );

        const taxRules: TaxRule[] =
          product.taxes
            ?.map((itemTax) => {
              const tax = itemTax.tax;
              if (!tax) return null;
              if (tax.status !== "active") return null;
              return {
                id: tax.id,
                label: tax.name,
                type: tax.type,
                rate: tax.rate,
              } as TaxRule;
            })
            .filter((rule): rule is TaxRule => Boolean(rule)) ?? [];

        const taxResult = calculateProductTax({
          productId: product.id,
          storeId: product.storeId,
          basePrice: unitNetPrice,
          unitNetPrice,
          quantity,
          taxes: taxRules,
          precision,
        });

        const lineTaxAmount = roundCurrency(taxResult.taxTotal, precision);
        const lineTotal = roundCurrency(lineNetAmount + lineTaxAmount, precision);

        const discountAdjustments = discountResult.adjustments.map((adjustment) => ({
          ...adjustment,
          amount: roundCurrency(adjustment.amount * quantity, precision),
        }));

        const taxAdjustments = taxResult.adjustments.map((adjustment) => ({
          ...adjustment,
          amount: roundCurrency(adjustment.amount * quantity, precision),
        }));

        productCalculations.push({
          productId: product.id,
          storeId: product.storeId,
          quantity,
          unitBasePrice: unitPrice,
          lineBaseAmount,
          unitPriceAfterDiscounts: unitNetPrice,
          unitTaxAmount: roundCurrency(taxResult.unitTax, precision),
          lineNetAmount,
          lineTaxAmount,
          lineTotal,
          discountTotal: lineDiscountTotal,
          taxTotal: lineTaxAmount,
          discountAdjustments,
          taxAdjustments,
        });

        orderItemsData.push({
          productId: item.productId,
          quantity,
          unitPrice,
          unitPriceFinal: unitNetPrice,
          lineSubtotal: lineBaseAmount,
          lineDiscount: lineDiscountTotal,
        });
      }

      const netSubtotal = roundCurrency(
        productCalculations.reduce((sum, item) => sum + item.lineNetAmount, 0),
        precision
      );

      if (netSubtotal <= 0) {
        throw new Error("El total de la orden debe ser mayor a cero");
      }

      // --- Motor de promociones y totales ---
      let promotionRule: CouponRule | null = null;
      let finalPromotionId: string | undefined;
      let promotionCodeUsed: string | undefined;

      if (payload?.promotionCode) {
        const promotion = await tx.promotion.findFirst({
          where: {
            code: payload.promotionCode,
            status: "active",
            storeId: payload.storeId,
            startsAt: { lte: new Date() },
            endsAt: { gte: new Date() },
          },
          select: {
            id: true,
            value: true,
            code: true,
            name: true,
            type: true,
          },
        });

        if (!promotion || !promotion.value || promotion.value <= 0) {
          throw new Error("El codigo de promocion no es valido o ha expirado.");
        }

        if (promotion.type === "coupon") {
          const alreadyUsed = await tx.order.count({
            where: {
              userId: targetUserId,
              promotionId: promotion.id,
            },
          });

          if (alreadyUsed > 0) {
            throw new Error("Ya utilizaste este cupon en una orden anterior.");
          }
        }

        finalPromotionId = promotion.id;
        promotionCodeUsed = promotion.code ?? payload.promotionCode;
        promotionRule = {
          id: promotion.id,
          code: promotionCodeUsed,
          type: "percentage",
          value: promotion.value,
          scope: "store",
          metadata: {
            name: promotion.name,
            promotionType: promotion.type,
          },
        };
      }

      const shippingCharge = selectedShippingMethod?.cost ?? 0;

      const cartTotals = calculateCartTotals({
        stores: [
          {
            storeId: payload.storeId,
            items: productCalculations,
            coupon: promotionRule,
            discounts: [],
            shippingAmount: shippingCharge,
            precision,
          },
        ],
        promotions: [],
        precision,
      });

      const storeTotals = cartTotals.stores[0];

      const subtotal = roundCurrency(
        productCalculations.reduce((sum, item) => sum + item.lineBaseAmount, 0),
        precision
      );
      const productDiscountTotal = roundCurrency(
        productCalculations.reduce((sum, item) => sum + item.discountTotal, 0),
        precision
      );
      const storeDiscountTotal = roundCurrency(storeTotals.discountTotal, precision);
      const promotionsTotal = roundCurrency(cartTotals.promotionsTotal, precision);

      const taxAmount = roundCurrency(cartTotals.taxTotal, precision);
      const shippingAmount = roundCurrency(storeTotals.shippingAmount, precision);
      const totalDiscountAmount = roundCurrency(
        productDiscountTotal + storeDiscountTotal + promotionsTotal,
        precision
      );
      const total = roundCurrency(cartTotals.total, precision);
      const priceAdjustments = cartTotals.adjustments
        .map((adjustment) => ({
          ...adjustment,
          amount: roundCurrency(adjustment.amount, precision),
        }))
        .filter((adjustment) => adjustment.amount !== 0);

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
          shippingMethodId: selectedShippingMethod?.id ?? undefined,
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

    notifyOrderCreated(order).catch((error) =>
      console.error(
        "[mail] No se pudo enviar la confirmacion de orden",
        error
      )
    );

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
