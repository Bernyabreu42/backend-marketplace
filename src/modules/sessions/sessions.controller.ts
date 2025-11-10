import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../../config/env";
import prisma from "../../database/prisma";
import { generateRefreshToken } from "../../utils/jwt";

const { JWT_REFRESH_SECRET } = env;
const REFRESH_TOKEN_EXPIRATION_DAYS = 7;
const SESSION_MAX_TTL_DAYS = 30;
const MAX_USER_AGENT_LENGTH = 512;
const MAX_IP_LENGTH = 64;
const MAX_DEVICE_ID_LENGTH = 128;

const addDays = (d: Date, n: number) =>
  new Date(d.getTime() + n * 24 * 60 * 60 * 1000);

const sanitizeSessionMeta = (
  meta?: { userAgent?: string; ip?: string; deviceId?: string }
) => {
  if (!meta) return {};

  const trimmed: {
    userAgent?: string;
    ip?: string;
    deviceId?: string;
  } = {};

  if (meta.userAgent) {
    trimmed.userAgent = meta.userAgent.slice(0, MAX_USER_AGENT_LENGTH);
  }
  if (meta.ip) {
    trimmed.ip = meta.ip.slice(0, MAX_IP_LENGTH);
  }
  if (meta.deviceId) {
    trimmed.deviceId = meta.deviceId.slice(0, MAX_DEVICE_ID_LENGTH);
  }

  return trimmed;
};

/** 1) Crear sesion + presencia */
export async function createSession(
  userId: string,
  meta?: { userAgent?: string; ip?: string; deviceId?: string }
): Promise<string> {
  const refreshToken = generateRefreshToken({ id: userId });

  const expiresAt = addDays(new Date(), REFRESH_TOKEN_EXPIRATION_DAYS);
  const sanitizedMeta = sanitizeSessionMeta(meta);

  await prisma.$transaction([
    prisma.session.create({
      data: {
        userId,
        refreshToken,
        expiresAt,
        ...sanitizedMeta,
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
export async function rotateRefreshToken(
  oldToken: string,
  meta?: { userAgent?: string; ip?: string; deviceId?: string }
) {
  const session = await getValidSession(oldToken);
  if (!session) return null;

  const now = new Date();
  if (SESSION_MAX_TTL_DAYS > 0) {
    const maxLifetime = addDays(session.createdAt, SESSION_MAX_TTL_DAYS);
    if (maxLifetime <= now) {
      await deleteSession(oldToken);
      return null;
    }
  }

  const newToken = generateRefreshToken({ id: session.userId });
  const newExpires = addDays(now, REFRESH_TOKEN_EXPIRATION_DAYS);
  const sanitizedMeta = sanitizeSessionMeta(meta);

  const updateData: Record<string, unknown> = {
    refreshToken: newToken,
    expiresAt: newExpires,
    updatedAt: now,
  };

  if (sanitizedMeta.userAgent) {
    updateData.userAgent = sanitizedMeta.userAgent;
  }
  if (sanitizedMeta.ip) {
    updateData.ip = sanitizedMeta.ip;
  }
  if (sanitizedMeta.deviceId) {
    updateData.deviceId = sanitizedMeta.deviceId;
  }

  await prisma.session.update({
    where: { id: session.id },
    data: updateData,
  });

  return { refreshToken: newToken, expiresAt: newExpires, session };
}
