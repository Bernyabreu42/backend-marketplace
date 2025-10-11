import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../../config/env";
import prisma from "../../database/prisma";
import { generateRefreshToken } from "../../utils/jwt";

const { JWT_REFRESH_SECRET } = env;
const REFRESH_TOKEN_EXPIRATION_DAYS = 7;

const addDays = (d: Date, n: number) =>
  new Date(d.getTime() + n * 24 * 60 * 60 * 1000);

/** 1) Crear sesion + presencia */
export async function createSession(
  userId: string,
  meta?: { userAgent?: string; ip?: string; deviceId?: string }
): Promise<string> {
  const refreshToken = generateRefreshToken({ id: userId });

  const expiresAt = addDays(new Date(), REFRESH_TOKEN_EXPIRATION_DAYS);

  await prisma.$transaction([
    prisma.session.create({
      data: {
        userId,
        refreshToken,
        expiresAt,
        userAgent: meta?.userAgent,
        ip: meta?.ip,
        deviceId: meta?.deviceId,
      },
    }),

    prisma.user.update({
      where: { id: userId },
      data: { isOnline: true, lastLogin: new Date(), lastSeenAt: new Date() },
    }),
  ]);

  return refreshToken;
}

/** 2) Invalidar (revocar) una sesion por refreshToken */
export async function deleteSession(refreshToken: string) {
  const session = await prisma.session.findUnique({ where: { refreshToken } });
  if (!session) return;

  await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: session.id },
      data: { revoked: true, revokedAt: new Date() },
    });

    const remaining = await tx.session.count({
      where: {
        userId: session.userId,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (remaining === 0) {
      await tx.user.update({
        where: { id: session.userId },
        data: { isOnline: false, lastSeenAt: new Date() },
      });
    }
  });
}

/** 3) Validar sesion (firma JWT + flags de DB + estado de cuenta) */
export async function getValidSession(refreshToken: string) {
  // Verifica que el token no esta modificado y no esta expirado segun el JWT
  try {
    jwt.verify(refreshToken, JWT_REFRESH_SECRET) as JwtPayload;
  } catch {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { refreshToken },
    include: { user: true },
  });

  if (!session) return null;
  if (session.revoked) return null;
  if (session.expiresAt <= new Date()) return null;

  // Estado de cuenta
  if (session.user.status !== "active") return null;
  if (!session.user.emailVerified) return null;

  return session;
}

/** 4) (Opcional) Rotar refresh token en /refresh */
export async function rotateRefreshToken(oldToken: string) {
  const session = await getValidSession(oldToken);
  if (!session) return null;

  const newToken = generateRefreshToken({ id: session.userId });

  const newExpires = addDays(new Date(), REFRESH_TOKEN_EXPIRATION_DAYS);

  // Podes: a) actualizar la misma fila, o b) revocar y crear una nueva (historico mas limpio).
  await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshToken: newToken,
      expiresAt: newExpires,
      updatedAt: new Date(),
    },
  });

  return { refreshToken: newToken, expiresAt: newExpires };
}

