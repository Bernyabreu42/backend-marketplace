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

    const userSpy = mock(async ({ include }: any) => {
      if (include) {
        return { ...userRecord, store: null };
      }
      return userRecord;
    });
    (prisma.user as any).findUnique = userSpy;

    const rotateSpy = spyOn(
      sessionsController,
      "rotateRefreshToken"
    ).mockResolvedValue({
      refreshToken: "new-refresh-token",
      expiresAt: new Date(Date.now() + 60_000),
      session: {
        id: "session-1",
        userId: "user-2",
      } as any,
    });

    const middleware = routeProtector([RolesEnum.ADMIN]);
    const req: any = {
      cookies: { refreshToken },
      headers: { "user-agent": "jest-agent", "x-forwarded-for": "203.0.113.5" },
      ip: "10.0.0.1",
    };
    const res = createMockRes();
    const next = mock(() => {});

    await middleware(req, res, next);

    expect(rotateSpy).toHaveBeenCalledWith(refreshToken, {
      userAgent: "jest-agent",
      ip: "203.0.113.5",
    });
    expect(res.cookie).toHaveBeenCalledTimes(2);
    expect(res.cookies.map((c: any) => c.name)).toEqual([
      "accessToken",
      "refreshToken",
    ]);
    expect(req.user).toMatchObject(userRecord);
    expect(next).toHaveBeenCalledTimes(1);

    rotateSpy.mockRestore();
  });
});

