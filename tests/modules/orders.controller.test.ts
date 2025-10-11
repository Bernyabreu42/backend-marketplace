import { afterEach, describe, expect, it, mock } from "bun:test";

import "../utils/test-env";
import { RolesEnum } from "../../src/core/enums";
import prisma from "../../src/database/prisma";
import {
  createOrder,
  getOrderById,
  listOrders,
  updateOrderStatus,
} from "../../src/modules/orders/orders.controller";
import { createMockReq, createMockRes } from "../utils/http";

const originalOrderFindUnique = prisma.order.findUnique;
const originalOrderUpdate = prisma.order.update;

afterEach(() => {
  (prisma.order as any).findUnique = originalOrderFindUnique;
  (prisma.order as any).update = originalOrderUpdate;
});

describe("orders.controller", () => {
  it("impide listar ordenes sin permisos de soporte", async () => {
    const req = createMockReq({
      query: {},
      user: { id: "11111111-1111-1111-1111-111111111111", role: RolesEnum.BUYER },
    });
    const res = createMockRes();

    await listOrders(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body?.message).toBe("Acceso denegado");
  });

  it("rechaza crear orden para otro usuario sin privilegios", async () => {
    const req = createMockReq({
      body: {
        storeId: "22222222-2222-2222-2222-222222222222",
        userId: "33333333-3333-3333-3333-333333333333",
        items: [
          {
            productId: "44444444-4444-4444-4444-444444444444",
            quantity: 1,
          },
        ],
      },
      user: {
        id: "11111111-1111-1111-1111-111111111111",
        role: RolesEnum.BUYER,
      },
    });
    const res = createMockRes();

    await createOrder(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body?.message).toBe(
      "No tienes permisos para crear ordenes para otro usuario"
    );
  });

  it("no permite actualizar estado si el usuario no es propietario ni soporte", async () => {
    (prisma.order as any).findUnique = mock(async () => ({
      id: "55555555-5555-5555-5555-555555555555",
      store: { ownerId: "99999999-9999-9999-9999-999999999999" },
    }));

    const req = createMockReq({
      params: { id: "55555555-5555-5555-5555-555555555555" },
      body: { status: "shipped" },
      user: {
        id: "11111111-1111-1111-1111-111111111111",
        role: RolesEnum.BUYER,
      },
    });
    const res = createMockRes();

    await updateOrderStatus(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body?.message).toBe("Acceso denegado");
  });

  it("retorna 404 cuando la orden no existe", async () => {
    (prisma.order as any).findUnique = mock(async () => null);

    const req = createMockReq({
      params: { id: "66666666-6666-6666-6666-666666666666" },
      user: {
        id: "11111111-1111-1111-1111-111111111111",
        role: RolesEnum.ADMIN,
      },
    });
    const res = createMockRes();

    await getOrderById(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body?.message).toBe("Orden no encontrada");
  });
});
