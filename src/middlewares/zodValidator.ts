import { ZodSchema } from "zod";
import { ApiResponse } from "../core/responses/ApiResponse";
import type { NextFunction, Request, Response } from "express";

export const validate =
  (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json(
        ApiResponse.error({
          message: "Datos inválidos",
          error: parsed.error.flatten(),
        })
      );
      return;
    }

    // Inyectamos los datos validados para usarlos directo en el controlador
    req.body = parsed.data;
    next();
  };
