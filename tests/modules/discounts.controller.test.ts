import {
  afterEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

import "../utils/test-env";
import prisma from "../../src/database/prisma";
import { getDiscountById } from "../../src/modules/discounts/discounts.controller";
import { createMockReq, createMockRes } from "../utils/http";

const originalDiscountFindUnique = prisma.discount.findUnique;

afterEach(() => {
  (prisma.discount as any).findUnique = originalDiscountFindUnique;
});

describe("discounts.controller > getDiscountById", () => {
  it("returns 400 for invalid id", async () => {
    const req = createMockReq({ params: { id: "invalid" } });
    const res = createMockRes();

    await getDiscountById(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body?.message).toBe("ID invalido");
  });

  it("returns 404 when missing", async () => {
    (prisma.discount as any).findUnique = mock(async () => null);

    const req = createMockReq({ params: { id: "1ce1f3f0-36c8-4d3d-9b39-08c9a2e99f73" } });
    const res = createMockRes();

    await getDiscountById(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
