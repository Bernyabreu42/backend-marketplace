import type { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../core/responses/ApiResponse";
import type { RolesEnum } from "../core/enums";
import prisma from "../database/prisma";
import {
  generateAccessToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../utils/jwt";
import { createSession } from "../modules/sessions/sessions.controller";

export const routeProtector = (allowedRoles?: RolesEnum[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.accessToken;
    const refreshToken = req.cookies?.refreshToken;

    try {
      // 1️⃣ Validar el access token normalmente
      if (token) {
        const payload = verifyAccessToken(token);
        const userId = payload?.sub ?? payload.id;
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: { store: true },
        });

        if (!user) {
          res
            .status(404)
            .json(ApiResponse.error({ message: "Usuario no encontrado" }));
          return;
        }

        // Verificar roles
        if (allowedRoles && !allowedRoles.includes(user.role as RolesEnum)) {
          res
            .status(403)
            .json(ApiResponse.error({ message: "Acceso denegado" }));
          return;
        }

        req.user = user;
        return next();
      }

      // 2️⃣ Si no hay access token, intentamos con el refresh token
      if (!refreshToken) {
        res.status(401).json(ApiResponse.error({ message: "Token requerido" }));
        return;
      }

      const payload = verifyRefreshToken(refreshToken);
      const userId = payload?.sub ?? payload.id;

      const session = await prisma.session.findUnique({
        where: { refreshToken },
      });

      if (!session) {
        res.status(401).json(ApiResponse.error({ message: "Sesión inválida" }));
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        res
          .status(404)
          .json(ApiResponse.error({ message: "Usuario no encontrado" }));
        return;
      }

      // Refresh Token Rotation
      await prisma.session.delete({
        where: { refreshToken },
      });

      const newRefreshToken = await createSession(user.id);
      const newAccessToken = generateAccessToken({ id: user.id });

      res
        .cookie("accessToken", newAccessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
          maxAge: 15 * 60 * 1000,
        })
        .cookie("refreshToken", newRefreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

      // Verificar roles también después del refresh
      if (allowedRoles && !allowedRoles.includes(user.role as RolesEnum)) {
        res.status(403).json(ApiResponse.error({ message: "Acceso denegado" }));
        return;
      }

      req.user = user;
      return next();
    } catch (error) {
      // console.error("Protección de ruta falló:", error);
      res.status(401).json(ApiResponse.error({ error }));
      return;
    }
  };
};
