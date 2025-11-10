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
  addFavorite,
  removeFavorite,
} from "../../src/modules/favorites/favorites.controller";
import { createMockReq, createMockRes } from "../utils/http";

const ensureFavoriteDelegate = () => {
  if (!(prisma as any).favorite) {
    (prisma as any).favorite = {
      findUnique: async () => null,
      findMany: async () => [],
      create: async () => ({}),
      delete: async () => ({}),
    };
  }
};

ensureFavoriteDelegate();

const originalFavoriteFindUnique = prisma.favorite.findUnique;
const originalFavoriteCreate = prisma.favorite.create;
const originalFavoriteDelete = prisma.favorite.delete;
const originalFavoriteFindMany = prisma.favorite.findMany;
const originalProductFindFirst = prisma.product.findFirst;
const originalProductUpdate = prisma.product.update;
const originalTransaction = prisma.$transaction;

afterEach(() => {
  (prisma.favorite as any).findUnique = originalFavoriteFindUnique;
  (prisma.favorite as any).create = originalFavoriteCreate;
  (prisma.favorite as any).delete = originalFavoriteDelete;
  (prisma.favorite as any).findMany = originalFavoriteFindMany;
  (prisma.product as any).findFirst = originalProductFindFirst;
  (prisma.product as any).update = originalProductUpdate;
  (prisma as any).$transaction = originalTransaction;
});

describe("favorites.controller > addFavorite", () => {
  it("returns 401 when user is not authenticated", async () => {
    const req = createMockReq({ params: { productId: "not-a-uuid" } });
    const res = createMockRes();

    await addFavorite(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body?.message).toBe("Autenticacion requerida");
  });

  it("adds a favorite when product is available", async () => {
    const req = createMockReq({
      params: { productId: "0199ff74-fb78-7000-96e8-c3e234aceafa" },
      user: { id: "user-1" },
    });
    const res = createMockRes();

    const favoriteCreate = mock(async () => ({}));
    const productUpdate = mock(async () => ({}));

    (prisma.favorite as any).findUnique = mock(async () => null);
    (prisma.product as any).findFirst = mock(async () => ({ id: req.params.productId }));
    (prisma.favorite as any).create = favoriteCreate;
    (prisma.product as any).update = productUpdate;
    (prisma as any).$transaction = mock(async (cb: any) =>
      cb({
        favorite: { create: favoriteCreate },
        product: { update: productUpdate },
      })
    );

    await addFavorite(req as any, res as any);

    expect(favoriteCreate).toHaveBeenCalled();
    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: req.params.productId },
      data: { favoritesCount: { increment: 1 } },
    });
    expect(res.body?.message).toBe("Producto agregado a favoritos");
  });
});

describe("favorites.controller > removeFavorite", () => {
  it("removes a favorite that exists", async () => {
    const req = createMockReq({
      params: { productId: "0199ff74-fb78-7000-96e8-c3e234aceafa" },
      user: { id: "user-1" },
    });
    const res = createMockRes();

    const favoriteDelete = mock(async () => ({}));
    const productUpdate = mock(async () => ({}));

    (prisma.favorite as any).findUnique = mock(async () => ({
      id: "favorite-1",
      userId: req.user.id,
      productId: req.params.productId,
    }));
    (prisma.favorite as any).delete = favoriteDelete;
    (prisma.product as any).update = productUpdate;
    (prisma as any).$transaction = mock(async (cb: any) =>
      cb({
        favorite: { delete: favoriteDelete },
        product: { update: productUpdate },
      })
    );

    await removeFavorite(req as any, res as any);

    expect(favoriteDelete).toHaveBeenCalledWith({ where: { id: "favorite-1" } });
    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: req.params.productId },
      data: { favoritesCount: { decrement: 1 } },
    });
    expect(res.body?.message).toBe("Producto eliminado de favoritos");
  });
});
