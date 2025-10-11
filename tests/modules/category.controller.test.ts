import {
  afterEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

import "../utils/test-env";
import prisma from "../../src/database/prisma";
import { getCategoryById } from "../../src/modules/category/category.controller";
import { createMockReq, createMockRes } from "../utils/http";

const originalCategoryFindUnique = prisma.category.findUnique;

afterEach(() => {
  (prisma.category as any).findUnique = originalCategoryFindUnique;
});

describe("category.controller > getCategoryById", () => {
  it("returns 400 for invalid id", async () => {
    const req = createMockReq({ params: { id: "bad" } });
    const res = createMockRes();

    await getCategoryById(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body?.message).toBe("ID de categoría inválido");
  });

  it("returns 404 when category does not exist", async () => {
    (prisma.category as any).findUnique = mock(async () => null);

    const req = createMockReq({
      params: { id: "86f9b648-3f50-4cef-9deb-13a4c4e0f6e3" },
    });
    const res = createMockRes();

    await getCategoryById(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body?.message).toBe("Categoría no encontrada");
  });

  it("returns category data when found", async () => {
    (prisma.category as any).findUnique = mock(async () => ({
      id: "86f9b648-3f50-4cef-9deb-13a4c4e0f6e3",
      name: "Bebidas",
      slug: "bebidas",
    }));

    const req = createMockReq({
      params: { id: "86f9b648-3f50-4cef-9deb-13a4c4e0f6e3" },
    });
    const res = createMockRes();

    await getCategoryById(req as any, res as any);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.body?.data).toMatchObject({ name: "Bebidas" });
  });
});
