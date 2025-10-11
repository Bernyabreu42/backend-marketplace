import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

import prisma from "../../src/database/prisma";

let originalCreate: any;

beforeEach(() => {
  originalCreate = prisma.order.create;
  delete (globalThis as any).__orderLoyaltyHookRegistered;
  delete (globalThis as any).__orderLoyaltyAwardExecutor;
});

afterEach(() => {
  (prisma.order as any).create = originalCreate;
  delete (prisma.order as any).__originalCreate;
  delete (globalThis as any).__orderLoyaltyHookRegistered;
  delete (globalThis as any).__orderLoyaltyAwardExecutor;
});

const waitForMicrotasks = () =>
  new Promise((resolve) => queueMicrotask(resolve));

describe("order loyalty hook", () => {
  it("ejecuta el premio de puntos despues de crear la orden", async () => {
    const calls: any[] = [];
    (prisma.order as any).create = async (...args: any[]) => {
      calls.push(args);
      return { id: "order-123" };
    };
    delete (prisma.order as any).__originalCreate;

    const mod = await import(
      `../../src/modules/orders/order-loyalty-hook?test=${Date.now()}`
    );

    const awardMock = mock(async () => {});
    mod.setLoyaltyAwardExecutor(awardMock as any);

    await prisma.order.create({} as any);
    await waitForMicrotasks();

    expect(calls.length).toBe(1);
    expect(awardMock).toHaveBeenCalledWith("order-123");
  });

  it("no dispara el premio si la orden no tiene id", async () => {
    const calls: any[] = [];
    (prisma.order as any).create = async (...args: any[]) => {
      calls.push(args);
      return { name: "sin id" };
    };
    delete (prisma.order as any).__originalCreate;

    const mod = await import(
      `../../src/modules/orders/order-loyalty-hook?test=${Date.now()}`
    );

    const awardMock = mock(async () => {});
    mod.setLoyaltyAwardExecutor(awardMock as any);

    await prisma.order.create({} as any);
    await waitForMicrotasks();

    expect(calls.length).toBe(1);
    expect(awardMock).not.toHaveBeenCalled();
  });
});
