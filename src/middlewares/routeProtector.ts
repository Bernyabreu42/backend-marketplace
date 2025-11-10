import type { NextFunction, Request, Response } from "express";

import { accessTokenCookie, refreshTokenCookie } from "../config/cookies";
import type { RolesEnum } from "../core/enums";
import { ApiResponse } from "../core/responses/ApiResponse";
import prisma from "../database/prisma";
import { rotateRefreshToken } from "../modules/sessions/sessions.controller";
import { generateAccessToken, verifyAccessToken } from "../utils/jwt";

const userForRequestSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  displayName: true,
  username: true,
  status: true,
  emailVerified: true,
  role: true,
  profileImage: true,
  store: {
    select: {
      id: true,
      ownerId: true,
      status: true,
    },
  },
} as const;

const findUserForRequest = (userId: string) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: userForRequestSelect,
  });

const isRoleAllowed = (allowed: RolesEnum[] | undefined, role: RolesEnum) =>
  !allowed || allowed.includes(role);

const extractClientIp = (req: Request): string | undefined => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0];
  }
  return req.ip;
};

const extractUserAgent = (req: Request): string | undefined => {
  const header = req.headers["user-agent"];
  if (Array.isArray(header)) return header[0];
  return header ?? undefined;
};

export const routeProtector = (allowedRoles?: RolesEnum[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const accessToken = req.cookies?.accessToken;
    const refreshToken = req.cookies?.refreshToken;

    try {
      if (accessToken) {
        const payload = verifyAccessToken(accessToken);
        const userId = payload?.sub ?? payload.id;
        const user = await findUserForRequest(userId);

        if (!user) {
          res
            .status(404)
            .json(ApiResponse.error({ message: "Usuario no encontrado" }));
          return;
        }

        if (!isRoleAllowed(allowedRoles, user.role as RolesEnum)) {
          res
            .status(403)
            .json(ApiResponse.error({ message: "Acceso denegado" }));
          return;
        }

        req.user = user as Express.UserClaims;
        next();
        return;
      }

      if (!refreshToken) {
        res.status(401).json(ApiResponse.error({ message: "Token requerido" }));
        return;
      }

      const rotation = await rotateRefreshToken(refreshToken, {
        userAgent: extractUserAgent(req),
        ip: extractClientIp(req),
      });

      if (!rotation) {
        res
          .status(401)
          .json(ApiResponse.error({ message: "Sesion expirada o invalida" }));
        return;
      }

      const user = await findUserForRequest(rotation.session.userId);

      if (!user) {
        res
          .status(404)
          .json(ApiResponse.error({ message: "Usuario no encontrado" }));
        return;
      }

      const newAccessToken = generateAccessToken({ id: user.id });

      res
        .cookie("accessToken", newAccessToken, accessTokenCookie)
        .cookie("refreshToken", rotation.refreshToken, refreshTokenCookie);

      if (!isRoleAllowed(allowedRoles, user.role as RolesEnum)) {
        res.status(403).json(ApiResponse.error({ message: "Acceso denegado" }));
        return;
      }

      req.user = user as Express.UserClaims;
      next();
    } catch (error) {
      res
        .status(401)
        .json(ApiResponse.error({ message: "No autorizado", error }));
    }
  };
};
