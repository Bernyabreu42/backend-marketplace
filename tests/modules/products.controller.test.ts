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
  getProductById,
  searchProductsByStore,
} from "../../src/modules/products/products.controller";
import { createMockReq, createMockRes } from "../utils/http";

const ensureFavoriteDelegate = () => {
  if (!(prisma as any).favorite) {
    (prisma as any).favorite = {
      findUnique: async () => null,
      findMany: async () => [],
    };
  }
};

ensureFavoriteDelegate();

const originalProductFindUnique = prisma.product.findUnique;
const originalProductFindMany = prisma.product.findMany;
const originalProductCount = prisma.product.count;
const originalStoreFindUnique = prisma.store.findUnique;
const originalQueryRaw = prisma.$queryRaw;
const originalFavoriteFindMany = prisma.favorite.findMany;
const originalFavoriteFindUnique = prisma.favorite.findUnique;

afterEach(() => {
  (prisma.product as any).findUnique = originalProductFindUnique;
  (prisma.product as any).findMany = originalProductFindMany;
  (prisma.product as any).count = originalProductCount;
  (prisma.store as any).findUnique = originalStoreFindUnique;
  (prisma as any).$queryRaw = originalQueryRaw;
  (prisma.favorite as any).findMany = originalFavoriteFindMany;
  (prisma.favorite as any).findUnique = originalFavoriteFindUnique;
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
    (prisma.favorite as any).findUnique = mock(async () => null);

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
      status: "active",
      store: {
        id: "store-1",
        name: "Store Name",
        status: "active",
        isDeleted: false,
        ownerId: "owner-1",
      },
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
    (prisma.favorite as any).findUnique = mock(async () => null);

    const req = createMockReq({
      params: { id: "3b136df3-7dfb-4a46-bb8f-786f2caef4d6" },
    });
    const res = createMockRes();

    await getProductById(req as any, res as any);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.body?.data).toMatchObject({
      id: "3b136df3-7dfb-4a46-bb8f-786f2caef4d6",
      store: {
        id: "store-1",
        name: "Store Name",
        status: "active",
      },
    });
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

describe("products.controller > searchProductsByStore", () => {
  it("applies pagination based on query params", async () => {
    const storeId = "c24c5c17-79de-4ca3-8d32-0fc6d6ec5d67";

    (prisma.store as any).findUnique = mock(async () => ({
      id: storeId,
      ownerId: "owner-1",
      status: "active",
      isDeleted: false,
    }));

    (prisma as any).$queryRaw = mock(async () => [{ id: "product-1" }]);

    (prisma.product as any).findMany = mock(async () => [
      {
        id: "product-1",
        name: "Producto",
        sku: "SKU-1",
        price: 10,
        priceFinal: 10,
        images: [],
        stock: 5,
        status: "active",
      },
    ]);

    (prisma.product as any).count = mock(async () => 12);
    (prisma.favorite as any).findMany = mock(async () => []);

    const req = createMockReq({
      params: { storeId },
      query: { q: "pro", limit: "5", page: "2" },
    });
    const res = createMockRes();

    await searchProductsByStore(req as any, res as any);

    const findManyArgs = (prisma.product.findMany as any).mock.calls[0]?.[0];
    expect(findManyArgs.skip).toBe(5);
    expect(findManyArgs.take).toBe(5);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.body?.pagination).toEqual({
      page: 2,
      limit: 5,
      total: 12,
      totalPages: 3,
      next: true,
      prev: true,
    });
    expect(res.body?.data).toHaveLength(1);
  });
});
