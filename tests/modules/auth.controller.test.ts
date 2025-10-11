import bcrypt from "bcrypt";
import {
  afterEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

import "../utils/test-env";
import prisma from "../../src/database/prisma";
import { loginUser } from "../../src/modules/auth/auth.controller";
import { createMockReq, createMockRes } from "../utils/http";

const originalUserFindUnique = prisma.user.findUnique;

afterEach(() => {
  (prisma.user as any).findUnique = originalUserFindUnique;
});

describe("auth.controller > loginUser", () => {
  it("returns 400 when email or password is missing", async () => {
    const req = createMockReq({ body: { password: "secret" } });
    const res = createMockRes();

    await loginUser(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body?.message).toBe("Email y password son requeridos");
  });

  it("rejects users that do not exist", async () => {
    (prisma.user as any).findUnique = mock(async () => null);

    const req = createMockReq({
      body: { email: "ghost@example.com", password: "secret" },
    });
    const res = createMockRes();

    await loginUser(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body?.message).toBe("Credenciales inválidas");
  });

  it("rejects inactive users", async () => {
    (prisma.user as any).findUnique = mock(async () => ({
      id: "user-1",
      email: "user@example.com",
      password: await bcrypt.hash("password", 10),
      status: "inactive",
      emailVerified: true,
    }));

    const req = createMockReq({
      body: { email: "user@example.com", password: "password" },
    });
    const res = createMockRes();

    await loginUser(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body?.message).toBe("Cuenta deshabilitada");
  });

  it("rejects unverified users", async () => {
    (prisma.user as any).findUnique = mock(async () => ({
      id: "user-2",
      email: "user@example.com",
      password: await bcrypt.hash("password", 10),
      status: "active",
      emailVerified: false,
    }));

    const req = createMockReq({
      body: { email: "user@example.com", password: "password" },
    });
    const res = createMockRes();

    await loginUser(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body?.message).toBe("Usuario no verificado");
  });

  it("rejects invalid credentials", async () => {
    const hashed = await bcrypt.hash("correct-password", 10);

    (prisma.user as any).findUnique = mock(async () => ({
      id: "user-3",
      email: "user@example.com",
      password: hashed,
      status: "active",
      emailVerified: true,
    }));

    const req = createMockReq({
      body: { email: "user@example.com", password: "wrong-password" },
    });
    const res = createMockRes();

    await loginUser(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body?.message).toBe("Credenciales inválidas");
  });
});
