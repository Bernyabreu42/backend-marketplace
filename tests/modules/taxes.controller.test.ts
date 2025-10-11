import {
  afterEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

import "../utils/test-env";
import prisma from "../../src/database/prisma";
import { getTaxById } from "../../src/modules/taxes/taxes.controller";
import { createMockReq, createMockRes } from "../utils/http";

const originalTaxFindUnique = prisma.tax.findUnique;

afterEach(() => {
  (prisma.tax as any).findUnique = originalTaxFindUnique;
});

describe("taxes.controller > getTaxById", () => {
  it("returns 400 when id format is invalid", async () => {
    const req = createMockReq({ params: { id: "invalid" } });
    const res = createMockRes();

    await getTaxById(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body?.message).toBe("ID invalido");
  });

  it("returns 404 when tax is missing", async () => {
    (prisma.tax as any).findUnique = mock(async () => null);

    const req = createMockReq({
      params: { id: "3b136df3-7dfb-4a46-bb8f-786f2caef4d6" },
    });
    const res = createMockRes();

    await getTaxById(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body?.message).toBe("Impuesto no encontrado");
  });

  it("returns tax data when found", async () => {
    (prisma.tax as any).findUnique = mock(async () => ({
      id: "3b136df3-7dfb-4a46-bb8f-786f2caef4d6",
      name: "IVA",
      rate: 18,
    }));

    const req = createMockReq({
      params: { id: "3b136df3-7dfb-4a46-bb8f-786f2caef4d6" },
    });
    const res = createMockRes();

    await getTaxById(req as any, res as any);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.body?.data).toMatchObject({ id: "3b136df3-7dfb-4a46-bb8f-786f2caef4d6" });
  });
});
