import { OrderStatus } from "@prisma/client";

import { env } from "../../config/env";
import { mailService } from "./mailService";
import { calculateCashFromPoints } from "./loyalty-service";

type MaybePromise = Promise<void> | void;

const ORDER_STATUS_COPY: Record<
  OrderStatus,
  { label: string; message?: string }
> = {
  pending: {
    label: "Pendiente",
    message:
      "Estamos revisando tu pedido y te notificaremos cuando inicie el procesamiento.",
  },
  processing: {
    label: "En preparación",
    message: "Tu orden está siendo preparada. Te informaremos cuando salga.",
  },
  shipped: {
    label: "En camino",
    message: "Tu paquete fue despachado. Pronto recibirás más novedades.",
  },
  completed: {
    label: "Completada",
    message: "La orden fue marcada como entregada. ¡Gracias por tu compra!",
  },
  cancelled: {
    label: "Cancelada",
    message:
      "La orden fue cancelada. Si no solicitaste esta acción, contáctanos.",
  },
  refunded: {
    label: "Reembolsada",
    message:
      "La orden fue reembolsada. Según tu método de pago, puede tardar hasta 72 horas en acreditarse.",
  },
};

const formatCustomerName = (firstName?: string | null, fallback?: string) => {
  if (firstName && firstName.trim().length >= 2) return firstName.trim();
  if (fallback && fallback.trim().length > 0) {
    const emailLocal = fallback.split("@")[0] ?? "";
    return emailLocal.length ? emailLocal : "Cliente";
  }
  return "Cliente";
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
  }).format(value || 0);

const formatOrderDate = (date: Date | string | number) =>
  new Intl.DateTimeFormat("es-DO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(typeof date === "string" || typeof date === "number" ? new Date(date) : date);

type OrderForNotification = {
  id: string;
  subtotal: number;
  totalDiscountAmount: number;
  taxAmount: number;
  shippingAmount: number;
  total: number;
  createdAt: Date;
  store?: { id: string; name?: string | null } | null;
  user?: { email?: string | null; firstName?: string | null } | null;
  items: Array<{
    quantity: number;
    unitPrice: number;
    unitPriceFinal: number | null;
    lineSubtotal: number;
    lineDiscount: number;
    product?: { name?: string | null } | null;
  }>;
};

export const notifyOrderCreated = async (order: OrderForNotification): Promise<void> => {
  const to = order.user?.email;
  if (!to) return;

  const hostname = env.CLIENT_URL ?? env.CLIENTS_URLS?.[0];
  const orderUrl = hostname
    ? `${hostname.replace(/\/$/, "")}/orders/${order.id}`
    : undefined;

  const items = order.items.map((item) => {
    const unitPrice =
      item.unitPriceFinal ?? item.unitPrice ?? item.lineSubtotal / (item.quantity || 1);
    const lineNet = Math.max(item.lineSubtotal - (item.lineDiscount ?? 0), 0);

    return {
      name: item.product?.name ?? "Producto",
      quantity: item.quantity,
      unitPrice: formatCurrency(unitPrice),
      lineTotal: formatCurrency(lineNet),
    };
  });

  await mailService({
    to,
    subject: `Confirmación de tu orden #${order.id}`,
    template: "order-confirmation",
    data: {
      customerName: formatCustomerName(order.user?.firstName, to),
      orderCode: order.id,
      orderDate: formatOrderDate(order.createdAt),
      storeName: order.store?.name ?? "nuestra tienda",
      items,
      subtotal: formatCurrency(order.subtotal ?? 0),
      discounts: formatCurrency(order.totalDiscountAmount ?? 0),
      taxAmount: formatCurrency(order.taxAmount ?? 0),
      shippingAmount: formatCurrency(order.shippingAmount ?? 0),
      total: formatCurrency(order.total ?? 0),
      orderUrl,
    },
  });
};

export const notifyOrderStatusChange = async (params: {
  to: string | null | undefined;
  firstName?: string | null;
  orderId: string;
  status: OrderStatus;
  orderCode?: string | null;
  orderUrl?: string | null;
}): Promise<void> => {
  if (!params.to) return;

  const copy = ORDER_STATUS_COPY[params.status];
  const hostname = env.CLIENT_URL ?? env.CLIENTS_URLS?.[0];
  const orderUrl =
    params.orderUrl ??
    (hostname ? `${hostname.replace(/\/$/, "")}/orders/${params.orderId}` : undefined);

  await mailService({
    to: params.to,
    subject: `Estado actualizado para tu orden #${params.orderCode ?? params.orderId}`,
    template: "order-status-update",
    data: {
      customerName: formatCustomerName(params.firstName, params.to),
      orderCode: params.orderCode ?? params.orderId,
      statusLabel: copy.label,
      statusMessage: copy.message,
      orderUrl,
    },
  });
};

export const notifyLoyaltyPointsEarned = async (params: {
  to: string | null | undefined;
  firstName?: string | null;
  points: number;
  balance: number;
  description?: string | null;
  contextLabel?: string;
  programUrl?: string | null;
}): Promise<void> => {
  if (!params.to || params.points <= 0) return;

  const hostname = env.CLIENT_URL ?? env.CLIENTS_URLS?.[0];
  const programUrl =
    params.programUrl ??
    (hostname
      ? `${hostname.replace(/\/$/, "")}/account/loyalty`
      : undefined);

  const cashValue = calculateCashFromPoints(params.balance);

  await mailService({
    to: params.to,
    subject: `Sumaste ${params.points} puntos en el programa de lealtad`,
    template: "loyalty-points-earned",
    data: {
      customerName: formatCustomerName(params.firstName, params.to),
      pointsAwarded: params.points,
      movementSource:
        params.contextLabel ?? "fueron acreditados en tu cuenta",
      movementNote: params.description ?? "",
      currentBalance: params.balance,
      currentBalanceValue: new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
      }).format(cashValue || 0),
      programUrl,
    },
  });
};
