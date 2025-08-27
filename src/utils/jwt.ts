import jwt, { type JwtPayload } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "";
const EMAIL_TOKEN_SECRET = process.env.EMAIL_TOKEN_SECRET || "";
const RESET_SECRET = process.env.RESET_SECRET || "";

export const generateAccessToken = (payload: { id: string }) =>
  jwt.sign(payload, JWT_SECRET!, { expiresIn: "15m" });

export const generateRefreshToken = (payload: { id: string }) =>
  jwt.sign(payload, JWT_REFRESH_SECRET!, { expiresIn: "7d" });

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, JWT_SECRET!) as JwtPayload;

export const verifyRefreshToken = (token: string) =>
  jwt.verify(token, JWT_REFRESH_SECRET!) as JwtPayload;

export const generateEmailToken = (payload: { id: string }) =>
  jwt.sign({ ...payload, purpose: "email_verify" }, EMAIL_TOKEN_SECRET, {
    expiresIn: "24h",
  });

export const verifyEmailToken = (token: string) => {
  const data = jwt.verify(token, EMAIL_TOKEN_SECRET) as JwtPayload & {
    purpose?: string;
  };
  if (data.purpose !== "email_verify") throw new Error("Token inválido");
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
  if (p.purpose !== "pwd_reset") throw new Error("Token inválido");
  return p;
};
