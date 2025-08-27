import type { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../core/responses/ApiResponse";

const API_USERNAME = process.env.API_USERNAME;
const API_PASSWORD = process.env.API_PASSWORD;

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

  if (username !== API_USERNAME || password !== API_PASSWORD) {
    res.status(403).json(ApiResponse.error({ message: "Acceso denegado" }));
    return;
  }

  next();
};
