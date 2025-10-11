import { describe, expect, it } from "bun:test";

import "../utils/test-env";
import { RolesEnum } from "../../src/core/enums";
import {
  assignPointsToUser,
  redeemPointsController,
} from "../../src/modules/loyalty/loyalty.controller";
import { createMockReq, createMockRes } from "../utils/http";

describe("loyalty.controller", () => {
  it("rechaza asignar puntos sin accion ni cantidad", async () => {
    const req = createMockReq({
      body: {
        userId: "3b136df3-7dfb-4a46-bb8f-786f2caef4d6",
      },
    });
    const res = createMockRes();

    await assignPointsToUser(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body?.message).toBe("Debes enviar puntos o una accion valida");
  });

  it("impide canjear puntos de otro usuario sin permisos", async () => {
    const req = createMockReq({
      body: {
        userId: "11111111-1111-1111-1111-111111111111",
        points: 100,
      },
      user: {
        id: "22222222-2222-2222-2222-222222222222",
        role: RolesEnum.BUYER,
      },
    });
    const res = createMockRes();

    await redeemPointsController(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body?.message).toBe(
      "No tienes permisos para canjear por otro usuario"
    );
  });
});
