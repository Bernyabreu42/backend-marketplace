import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { buildRange, getLoyaltySummary, getSalesOverview, getSalesTimeseries } from "../../src/modules/dashboard/dashboard.service";
import prisma from "../../src/database/prisma";

const originals = {
  orderAggregate: prisma.order.aggregate,
  orderCount: prisma.order.count,
  userCount: prisma.user.count,
  queryRaw: prisma.$queryRaw,
  loyaltyAggregate: prisma.loyaltyTransaction.aggregate,
  accountAggregate: prisma.loyaltyAccount.aggregate,
};

beforeEach(() => {
  prisma.order.aggregate = originals.orderAggregate;
  prisma.order.count = originals.orderCount;
  prisma.user.count = originals.userCount;
  prisma.$queryRaw = originals.queryRaw;
  prisma.loyaltyTransaction.aggregate = originals.loyaltyAggregate;
  prisma.loyaltyAccount.aggregate = originals.accountAggregate;
});

afterEach(() => {
  prisma.order.aggregate = originals.orderAggregate;
  prisma.order.count = originals.orderCount;
  prisma.user.count = originals.userCount;
  prisma.$queryRaw = originals.queryRaw;
  prisma.loyaltyTransaction.aggregate = originals.loyaltyAggregate;
  prisma.loyaltyAccount.aggregate = originals.accountAggregate;
});

describe("dashboard.service", () => {
  it("calcula overview con deltas", async () => {
    const aggregates = [
      { _sum: { total: 1200 } },
      { _sum: { total: 800 } },
    ];
    prisma.order.aggregate = mock(async () => aggregates.shift() ?? { _sum: { total: 0 } });
    prisma.order.count = mock(async () => 10);
    prisma.user.count = mock(async () => 4);

    const result = await getSalesOverview({
      start: new Date("2025-09-01"),
      end: new Date("2025-09-30"),
    });

    expect(result.totalSales).toBe(1200);
    expect(result.deltaPercent).toBeCloseTo(50);
    expect(result.totalOrders).toBe(10);
  });

  it("devuelve serie temporal", async () => {
    prisma.$queryRaw = mock(async () => [
      { date: new Date("2025-09-01"), total: 100 },
      { date: new Date("2025-09-02"), total: 200 },
    ]);

    const series = await getSalesTimeseries({
      start: new Date("2025-09-01"),
      end: new Date("2025-09-02"),
    });

    expect(series).toEqual([
      { date: "2025-09-01", value: 100 },
      { date: "2025-09-02", value: 200 },
    ]);
  });

  it("resume puntos de lealtad", async () => {
    prisma.loyaltyTransaction.aggregate = mock(async ({ where }: any) => {
      if (where?.points?.gt != null) return { _sum: { points: 500 } };
      if (where?.points?.lt != null) return { _sum: { points: -200 } };
      return { _sum: { points: 0 } };
    });
    prisma.loyaltyAccount.aggregate = mock(async () => ({ _sum: { balance: 1000 } }));

    const summary = await getLoyaltySummary({
      start: new Date("2025-09-01"),
      end: new Date("2025-09-30"),
    });

    expect(summary.pointsIssued).toBe(500);
    expect(summary.pointsRedeemed).toBe(200);
    expect(summary.outstandingBalance).toBe(1000);
  });

  it("valida rangos al construir", () => {
    expect(() => buildRange("bad", undefined)).toThrow();
  });
});
