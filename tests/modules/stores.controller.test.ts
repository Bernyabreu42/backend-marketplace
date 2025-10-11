import {
  afterEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

import "../utils/test-env";
import prisma from "../../src/database/prisma";
import { getStore } from "../../src/modules/stores/stores.controller";
import { createMockReq, createMockRes } from "../utils/http";

const originalStoreFindUnique = prisma.store.findUnique;

afterEach(() => {
  (prisma.store as any).findUnique = originalStoreFindUnique;
});

describe("stores.controller > getStore", () => {
  it("returns 400 for invalid id", async () => {
    const req = createMockReq({ params: { id: "bad" } });
    const res = createMockRes();

    await getStore(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body?.message).toBe("ID inválido");
  });

  it("returns 404 when store is not found", async () => {
    (prisma.store as any).findUnique = mock(async () => null);

    const req = createMockReq({
      params: { id: "86f9b648-3f50-4cef-9deb-13a4c4e0f6e3" },
    });
    const res = createMockRes();

    await getStore(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body?.message).toBe("Tienda no encontrada");
  });

  it("returns store data when available", async () => {
    (prisma.store as any).findUnique = mock(async () => ({
      id: "86f9b648-3f50-4cef-9deb-13a4c4e0f6e3",
      name: "Mi tienda",
    }));

    const req = createMockReq({
      params: { id: "86f9b648-3f50-4cef-9deb-13a4c4e0f6e3" },
    });
    const res = createMockRes();

    await getStore(req as any, res as any);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.body?.data).toMatchObject({ name: "Mi tienda" });
  });
});
