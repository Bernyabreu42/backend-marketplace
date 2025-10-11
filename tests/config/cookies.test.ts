import { describe, expect, it } from "bun:test";

import "../utils/test-env";
import { env } from "../../src/config/env";
import { accessTokenCookie, refreshTokenCookie } from "../../src/config/cookies";

describe("cookie configuration", () => {
  it("reuses secure defaults", () => {
    expect(accessTokenCookie.httpOnly).toBe(true);
    expect(refreshTokenCookie.httpOnly).toBe(true);
    expect(refreshTokenCookie.path).toBe("/");
    expect(accessTokenCookie.secure).toBe(env.isProd);
    expect(refreshTokenCookie.secure).toBe(env.isProd);
    expect(accessTokenCookie.sameSite).toBe(env.isProd ? "none" : "lax");
    expect(refreshTokenCookie.sameSite).toBe(env.isProd ? "none" : "lax");
  });

  it("sets specific expirations", () => {
    expect(accessTokenCookie.maxAge).toBe(15 * 60 * 1000);
    expect(refreshTokenCookie.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
