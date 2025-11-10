import {
  afterEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

import "../utils/test-env";
import prisma from "../../src/database/prisma";
import {
  createAddress,
  deleteAddress,
  listAddresses,
} from "../../src/modules/addresses/addresses.controller";
import { createMockReq, createMockRes } from "../utils/http";

const ensureAddressDelegate = () => {
  if (!(prisma as any).userAddress) {
    (prisma as any).userAddress = {
      findMany: async () => [],
      findFirst: async () => null,
      findUnique: async () => null,
      count: async () => 0,
      updateMany: async () => {},
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => ({}),
    };
  }
};

ensureAddressDelegate();

const originalAddressFindMany = prisma.userAddress.findMany;
const originalAddressFindFirst = prisma.userAddress.findFirst;
const originalAddressFindUnique = prisma.userAddress.findUnique;
const originalTransaction = prisma.$transaction;

afterEach(() => {
  (prisma.userAddress as any).findMany = originalAddressFindMany;
  (prisma.userAddress as any).findFirst = originalAddressFindFirst;
  (prisma.userAddress as any).findUnique = originalAddressFindUnique;
  (prisma as any).$transaction = originalTransaction;
});

describe("addresses.controller > listAddresses", () => {
  it("returns 401 when user is not authenticated", async () => {
    const req = createMockReq();
    const res = createMockRes();

    await listAddresses(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body?.message).toBe("Autenticacion requerida");
  });

  it("returns lista de direcciones", async () => {
    (prisma.userAddress as any).findMany = mock(async () => [
      {
        id: "addr-1",
        userId: "user-1",
        label: "Casa",
        address: { country: "DO", city: "Santo Domingo", state: "DN", postalCode: "10101", street: "Calle 1" },
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const req = createMockReq({ user: { id: "user-1" } });
    const res = createMockRes();

    await listAddresses(req as any, res as any);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.body?.data).toHaveLength(1);
  });
});

describe("addresses.controller > createAddress", () => {
  it("creates a new default address when none exist", async () => {
    const countMock = mock(async () => 0);
    const updateManyMock = mock(async () => {});
    const createMock = mock(async () => ({
      id: "addr-1",
      userId: "user-1",
      label: "Casa",
      address: {
        country: "DO",
        state: "DN",
        city: "Santo Domingo",
        postalCode: "10101",
        street: "Calle 1",
      },
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    (prisma as any).$transaction = mock(async (cb: any) =>
      cb({
        userAddress: {
          count: countMock,
          updateMany: updateManyMock,
          create: createMock,
        },
      })
    );

    const req = createMockReq({
      user: { id: "user-1" },
      body: {
        label: "Casa",
        address: {
          country: "DO",
          state: "DN",
          city: "Santo Domingo",
          postalCode: "10101",
          street: "Calle 1",
        },
        isDefault: true,
      },
    });
    const res = createMockRes();

    await createAddress(req as any, res as any);

    expect(res.statusCode).toBe(201);
    expect(updateManyMock).toHaveBeenCalled();
    expect(res.body?.data?.isDefault).toBe(true);
  });
});

describe("addresses.controller > deleteAddress", () => {
  it("returns 404 when address does not exist", async () => {
    (prisma.userAddress as any).findFirst = mock(async () => null);

    const req = createMockReq({
      user: { id: "user-1" },
      params: { id: "addr-404" },
    });
    const res = createMockRes();

    await deleteAddress(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
