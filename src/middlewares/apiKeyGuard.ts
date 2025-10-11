import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env";
import { ApiResponse } from "../core/responses/ApiResponse";

export const apiKeyGuard = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.status(401).json(ApiResponse.error({ message: "No autenticado" }));
    return;
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString(
    "utf-8"
  );

  const [username, password] = credentials.split(":");

  if (username !== env.API_USERNAME || password !== env.API_PASSWORD) {
    res.status(403).json(ApiResponse.error({ message: "Acceso denegado" }));
    return;
  }

  next();
};
