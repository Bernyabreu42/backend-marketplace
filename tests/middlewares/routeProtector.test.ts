import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

import "../utils/test-env";
import prisma from "../../src/database/prisma";
import { RolesEnum } from "../../src/core/enums";
import { routeProtector } from "../../src/middlewares/routeProtector";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../../src/utils/jwt";
import * as sessionsController from "../../src/modules/sessions/sessions.controller";

const originalUserFindUnique = prisma.user.findUnique;
const originalSessionFindUnique = prisma.session.findUnique;
const originalSessionDelete = prisma.session.delete;

const createMockRes = () => {
  const res: any = {
    statusCode: 200,
    body: undefined,
    cookies: [] as Array<{ name: string; value: string; options: any }>,
  };
  res.status = mock((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = mock((payload: unknown) => {
    res.body = payload;
    return res;
  });
  res.cookie = mock((name: string, value: string, options: any) => {
    res.cookies.push({ name, value, options });
    return res;
  });
  return res;
};

afterEach(() => {
  (prisma.user as any).findUnique = originalUserFindUnique;
  (prisma.session as any).findUnique = originalSessionFindUnique;
  (prisma.session as any).delete = originalSessionDelete;
});

describe("routeProtector", () => {
  it("allows requests with a valid access token", async () => {
    const token = generateAccessToken({ id: "user-1" });
    (prisma.user as any).findUnique = mock(async () => ({
      id: "user-1",
      role: RolesEnum.ADMIN,
      store: null,
    }));

    const middleware = routeProtector();
    const req: any = { cookies: { accessToken: token } };
    const res = createMockRes();
    const next = mock(() => {});

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({ id: "user-1" });
    expect(res.status).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("rejects requests without tokens", async () => {
    const middleware = routeProtector();
    const req: any = { cookies: {} };
    const res = createMockRes();
    const next = mock(() => {});

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body?.message).toBe("Token requerido");
    expect(next).not.toHaveBeenCalled();
  });

  it("rotates refresh tokens and sets cookies", async () => {
    const refreshToken = generateRefreshToken({ id: "user-2" });
    const userRecord = { id: "user-2", role: RolesEnum.ADMIN };

    (prisma.session as any).findUnique = mock(async () => ({
      refreshToken,
      userId: "user-2",
      revoked: false,
      expiresAt: new Date(Date.now() + 60_000),
    }));
    (prisma.session as any).delete = mock(async () => {});
    const userSpy = mock(async ({ include }: any) => {
      if (include) {
        return { ...userRecord, store: null };
      }
      return userRecord;
    });
    (prisma.user as any).findUnique = userSpy;

    const createSessionSpy = spyOn(sessionsController, "createSession").mockResolvedValue(
      "new-refresh-token"
    );

    const middleware = routeProtector([RolesEnum.ADMIN]);
    const req: any = { cookies: { refreshToken } };
    const res = createMockRes();
    const next = mock(() => {});

    await middleware(req, res, next);

    expect(createSessionSpy).toHaveBeenCalledWith("user-2");
    expect(res.cookie).toHaveBeenCalledTimes(2);
    expect(res.cookies.map((c: any) => c.name)).toEqual([
      "accessToken",
      "refreshToken",
    ]);
    expect(req.user).toMatchObject(userRecord);
    expect(next).toHaveBeenCalledTimes(1);

    createSessionSpy.mockRestore();
  });
});

