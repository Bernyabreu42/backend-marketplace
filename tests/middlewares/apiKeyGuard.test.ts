import { describe, expect, it, mock } from "bun:test";

import "../utils/test-env";
import { env } from "../../src/config/env";
import { apiKeyGuard } from "../../src/middlewares/apiKeyGuard";

const createMockRes = () => {
  const res: any = {
    statusCode: 200,
    body: undefined,
  };
  res.status = mock((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = mock((payload: unknown) => {
    res.body = payload;
    return res;
  });
  return res;
};

describe("apiKeyGuard", () => {
  it("rejects missing authorization header", () => {
    const req: any = { headers: {} };
    const res = createMockRes();
    const next = mock(() => {});

    apiKeyGuard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body?.message).toBe("No autenticado");
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects invalid credentials", () => {
    const credentials = Buffer.from("wrong:creds").toString("base64");
    const req: any = {
      headers: { authorization: `Basic ${credentials}` },
    };
    const res = createMockRes();
    const next = mock(() => {});

    apiKeyGuard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body?.message).toBe("Acceso denegado");
    expect(next).not.toHaveBeenCalled();
  });

  it("allows valid credentials", () => {
    const credentials = Buffer.from(
      `${env.API_USERNAME}:${env.API_PASSWORD}`
    ).toString("base64");
    const req: any = {
      headers: { authorization: `Basic ${credentials}` },
    };
    const res = createMockRes();
    const next = mock(() => {});

    apiKeyGuard(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
