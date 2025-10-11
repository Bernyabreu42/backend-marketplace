import {
  afterEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

import "../utils/test-env";
import prisma from "../../src/database/prisma";
import { getProductById } from "../../src/modules/products/products.controller";
import { createMockReq, createMockRes } from "../utils/http";

const originalProductFindUnique = prisma.product.findUnique;

afterEach(() => {
  (prisma.product as any).findUnique = originalProductFindUnique;
});

describe("products.controller > getProductById", () => {
  it("returns 400 for invalid id", async () => {
    const req = createMockReq({ params: { id: "bad-id" } });
    const res = createMockRes();

    await getProductById(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body?.message).toBe("ID inválido");
  });

  it("returns 404 when product is not found", async () => {
    (prisma.product as any).findUnique = mock(async () => null);

    const req = createMockReq({
      params: { id: "3b136df3-7dfb-4a46-bb8f-786f2caef4d6" },
    });
    const res = createMockRes();

    await getProductById(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body?.message).toBe("Producto no encontrado");
  });

  it("returns product data with flattened taxes", async () => {
    (prisma.product as any).findUnique = mock(async () => ({
      id: "3b136df3-7dfb-4a46-bb8f-786f2caef4d6",
      name: "Product",
      store: { status: "active", isDeleted: false },
      taxes: [
        {
          tax: {
            id: "tax-1",
            name: "IVA",
            type: "percentage",
            rate: 18,
            description: "Impuesto"
          },
        },
      ],
      categories: [],
    }));

    const req = createMockReq({
      params: { id: "3b136df3-7dfb-4a46-bb8f-786f2caef4d6" },
    });
    const res = createMockRes();

    await getProductById(req as any, res as any);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.body?.data).toMatchObject({ id: "3b136df3-7dfb-4a46-bb8f-786f2caef4d6" });
    expect(res.body?.data?.taxes).toEqual([
      {
        id: "tax-1",
        name: "IVA",
        type: "percentage",
        rate: 18,
        description: "Impuesto",
      },
    ]);
  });
});
