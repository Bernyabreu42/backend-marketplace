import jwt, { type JwtPayload } from "jsonwebtoken";
import { randomUUID } from "crypto";

import { env } from "../config/env";

const {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  EMAIL_TOKEN_SECRET,
  RESET_SECRET,
} = env;

export const generateAccessToken = (payload: { id: string }) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });

export const generateRefreshToken = (payload: { id: string }) =>
  jwt.sign(
    { sub: payload.id, id: payload.id, jti: randomUUID() },
    JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, JWT_SECRET) as JwtPayload;

export const verifyRefreshToken = (token: string) =>
  jwt.verify(token, JWT_REFRESH_SECRET) as JwtPayload;

export const generateEmailToken = (payload: { id: string }) =>
  jwt.sign({ ...payload, purpose: "email_verify" }, EMAIL_TOKEN_SECRET, {
    expiresIn: "24h",
  });

export const verifyEmailToken = (token: string) => {
  const data = jwt.verify(token, EMAIL_TOKEN_SECRET) as JwtPayload & {
    purpose?: string;
  };
  if (data.purpose !== "email_verify") throw new Error("Token invalido");
  return data;
};

export const generatePasswordResetToken = (payload: { id: string }) =>
  jwt.sign({ ...payload, purpose: "pwd_reset" }, RESET_SECRET, {
    expiresIn: "30m",
  });

export const verifyPasswordResetToken = (token: string) => {
  const p = jwt.verify(token, RESET_SECRET) as JwtPayload & {
    purpose?: string;
  };
  if (p.purpose !== "pwd_reset") throw new Error("Token invalido");
  return p;
};
