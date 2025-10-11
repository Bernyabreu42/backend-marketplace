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
  getOnlyUser,
} from "../../src/modules/users/user.controller";
import { createMockReq, createMockRes } from "../utils/http";

const originalUserFindUnique = prisma.user.findUnique;

afterEach(() => {
  (prisma.user as any).findUnique = originalUserFindUnique;
});

describe("users.controller > getOnlyUser", () => {
  it("returns 400 when id is invalid", async () => {
    const req = createMockReq({ params: { id: "invalid" } });
    const res = createMockRes();

    await getOnlyUser(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body?.message).toBe("ID inválido");
  });

  it("returns 404 when user is not found", async () => {
    (prisma.user as any).findUnique = mock(async () => null);

    const req = createMockReq({
      params: { id: "86f9b648-3f50-4cef-9deb-13a4c4e0f6e3" },
    });
    const res = createMockRes();

    await getOnlyUser(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body?.message).toBe("Usuario no encontrado");
  });

  it("returns user data without password", async () => {
    (prisma.user as any).findUnique = mock(async () => ({
      id: "86f9b648-3f50-4cef-9deb-13a4c4e0f6e3",
      email: "user@example.com",
      password: "hashed",
      username: "TestUser",
      store: { id: "store-1" },
    }));

    const req = createMockReq({
      params: { id: "86f9b648-3f50-4cef-9deb-13a4c4e0f6e3" },
    });
    const res = createMockRes();

    await getOnlyUser(req as any, res as any);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.body?.data).toMatchObject({
      id: "86f9b648-3f50-4cef-9deb-13a4c4e0f6e3",
      email: "user@example.com",
      username: "TestUser",
      store: { id: "store-1" },
    });
    expect((res.body?.data as any).password).toBeUndefined();
  });
});
