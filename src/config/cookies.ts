import type { CookieOptions } from "express";
import { env } from "./env";

const baseCookie: CookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? "none" : "lax",
  path: "/",
  domain: env.COOKIE_DOMAIN,
};

export const accessTokenCookie: CookieOptions = {
  ...baseCookie,
  maxAge: 15 * 60 * 1000,
};

export const refreshTokenCookie: CookieOptions = {
  ...baseCookie,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
