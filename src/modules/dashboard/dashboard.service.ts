import { Prisma } from "@prisma/client";

import prisma from "../../database/prisma";

export type DateRange = {
  start: Date;
  end: Date;
};

export type SalesOverview = {
  totalSales: number;
  totalSalesPrevious: number;
  deltaPercent: number | null;
  totalOrders: number;
  totalOrdersPrevious: number;
  ordersDeltaPercent: number | null;
  newCustomers: number;
  newCustomersPrevious: number;
  customersDeltaPercent: number | null;
};

export type SalesTimeseriesPoint = {
  date: string;
  value: number;
};

export type OrdersByStatus = {
  status: string;
  count: number;
};

export type LoyaltySummary = {
  pointsIssued: number;
  pointsRedeemed: number;
  outstandingBalance: number;
};

export type TopProduct = {
  productId: string;
  name: string;
  revenue: number;
  quantity: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toISODate = (value: Date) => value.toISOString().slice(0, 10);

const percentDelta = (current: number, previous: number): number | null => {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
};

export const buildRange = (start?: string, end?: string, fallbackDays = 30): DateRange => {
  const now = new Date();
  const parsedEnd = end ? new Date(end) : now;
  const parsedStart = start ? new Date(start) : new Date(parsedEnd.getTime() - fallbackDays * DAY_MS);

  if (Number.isNaN(parsedStart.valueOf()) || Number.isNaN(parsedEnd.valueOf())) {
    throw new Error("Rango de fechas invalido");
  }

  if (parsedStart > parsedEnd) {
    throw new Error("La fecha inicial debe ser menor o igual a la final");
  }

  return {
    start: new Date(parsedStart.setHours(0, 0, 0, 0)),
    end: new Date(parsedEnd.setHours(23, 59, 59, 999)),
  };
};

export const previousRange = ({ start, end }: DateRange): DateRange => {
  const length = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - length);
  return {
    start: new Date(prevStart.setHours(0, 0, 0, 0)),
    end: new Date(prevEnd.setHours(23, 59, 59, 999)),
  };
};

export const getSalesOverview = async (range: DateRange): Promise<SalesOverview> => {
  const previous = previousRange(range);

  const [currentSales, previousSales, currentOrders, previousOrders, currentCustomers, previousCustomers] =
    await Promise.all([
      prisma.order.aggregate({
        _sum: { total: true },
        where: {
          createdAt: { gte: range.start, lte: range.end },
          status: { notIn: ["cancelled"] },
        },
      }),
      prisma.order.aggregate({
        _sum: { total: true },
        where: {
          createdAt: { gte: previous.start, lte: previous.end },
          status: { notIn: ["cancelled"] },
        },
      }),
      prisma.order.count({
        where: {
          createdAt: { gte: range.start, lte: range.end },
          status: { notIn: ["cancelled"] },
        },
      }),
      prisma.order.count({
        where: {
          createdAt: { gte: previous.start, lte: previous.end },
          status: { notIn: ["cancelled"] },
        },
      }),
      prisma.user.count({ where: { createdAt: { gte: range.start, lte: range.end } } }),
      prisma.user.count({ where: { createdAt: { gte: previous.start, lte: previous.end } } }),
    ]);

  const totalSales = currentSales._sum.total ?? 0;
  const totalSalesPrevious = previousSales._sum.total ?? 0;

  return {
    totalSales,
    totalSalesPrevious,
    deltaPercent: percentDelta(totalSales, totalSalesPrevious),
    totalOrders: currentOrders,
    totalOrdersPrevious: previousOrders,
    ordersDeltaPercent: percentDelta(currentOrders, previousOrders),
    newCustomers: currentCustomers,
    newCustomersPrevious: previousCustomers,
    customersDeltaPercent: percentDelta(currentCustomers, previousCustomers),
  };
};

export const getSalesTimeseries = async (range: DateRange): Promise<SalesTimeseriesPoint[]> => {
  const rows = await prisma.$queryRaw<Array<{ date: Date; total: number }>>`
    SELECT date("createdAt") AS date, COALESCE(SUM("total"), 0) AS total
    FROM "Order"
    WHERE "createdAt" BETWEEN ${range.start} AND ${range.end}
      AND "status" <> 'cancelled'
    GROUP BY date("createdAt")
    ORDER BY date("createdAt") ASC
  `;

  return rows.map((row) => ({
    date: toISODate(row.date),
    value: Number(row.total || 0),
  }));
};

export const getOrdersByStatus = async (range: DateRange): Promise<OrdersByStatus[]> => {
  const grouped = await prisma.order.groupBy({
    by: ["status"],
    _count: { _all: true },
    where: {
      createdAt: { gte: range.start, lte: range.end },
    },
  });

  return grouped.map((row) => ({ status: row.status, count: row._count._all }));
};

export const getLoyaltySummary = async (range: DateRange): Promise<LoyaltySummary> => {
  const [earned, redeemed, balance] = await Promise.all([
    prisma.loyaltyTransaction.aggregate({
      _sum: { points: true },
      where: {
        points: { gt: 0 },
        createdAt: { gte: range.start, lte: range.end },
      },
    }),
    prisma.loyaltyTransaction.aggregate({
      _sum: { points: true },
      where: {
        points: { lt: 0 },
        createdAt: { gte: range.start, lte: range.end },
      },
    }),
    prisma.loyaltyAccount.aggregate({
      _sum: { balance: true },
    }),
  ]);

  return {
    pointsIssued: earned._sum.points ?? 0,
    pointsRedeemed: Math.abs(redeemed._sum.points ?? 0),
    outstandingBalance: balance._sum.balance ?? 0,
  };
};

export const getTopProducts = async (range: DateRange, limit = 5): Promise<TopProduct[]> => {
  const rows = await prisma.$queryRaw<Array<{ productId: string; name: string; quantity: number; revenue: number }>>`
    SELECT
      oi."productId" AS "productId",
      COALESCE(p."name", 'Producto eliminado') AS name,
      SUM(oi.quantity)::float AS quantity,
      SUM(oi.quantity * COALESCE(p."priceFinal", p."price", 0))::float AS revenue
    FROM "OrderItem" oi
    INNER JOIN "Order" o ON o.id = oi."orderId"
    LEFT JOIN "Product" p ON p.id = oi."productId"
    WHERE o."createdAt" BETWEEN ${range.start} AND ${range.end}
      AND o."status" <> 'cancelled'
    GROUP BY oi."productId", p."name"
    ORDER BY revenue DESC
    LIMIT ${Prisma.raw(String(limit))}
  `;

  return rows.map((row) => ({
    productId: row.productId,
    name: row.name,
    revenue: Number(row.revenue || 0),
    quantity: Number(row.quantity || 0),
  }));
};
