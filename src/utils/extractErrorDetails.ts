import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import { ZodError } from "zod";

type ApiErr = {
  status: number;
  userMessage: string;
  fieldErrors?: Record<string, string>;
  dev?: any;
};

export function extractErrorDetails(error: any) {
  const details: Record<string, any> = {
    name: error.name || "Error",
    code: error.code,
    message: cleanMessage(error.message),
  };

  if (error.meta) details.meta = error.meta;
  if (error.stack) details.stack = shortenStack(error.stack);

  return details;
}

function cleanMessage(message: string): string {
  // Elimina saltos de línea innecesarios y deja lo importante
  return message?.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
}

function shortenStack(stack: string): string {
  const lines = stack.split("\n");
  return lines.slice(0, 2).join(" "); // Muestra solo primeras 2 líneas
}

export function prismaToApi(err: unknown): ApiErr {
  const out: ApiErr = { status: 500, userMessage: "Error interno" };

  // JWT
  if (err instanceof jwt.TokenExpiredError) {
    return {
      status: 401,
      userMessage: "Tu sesión expiró. Iniciá sesión nuevamente.",
    };
  }

  if (err instanceof jwt.JsonWebTokenError) {
    return { status: 401, userMessage: "Token inválido." };
  }

  // Validación
  if (err instanceof ZodError) {
    return {
      status: 422,
      userMessage: "Datos inválidos",
      fieldErrors: Object.fromEntries(
        err.issues.map((i) => [i.path.join("."), i.message || "Inválido"])
      ),
    };
  }

  // Prisma
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const fields = (err.meta?.target as string[]) ?? [];
      return {
        status: 409,
        userMessage:
          fields.length === 1
            ? `El ${fields[0]} ya está en uso`
            : "Al menos un valor único ya está en uso",
        fieldErrors: Object.fromEntries(
          fields.map((f) => [f, "Ya está en uso"])
        ),
      };
    }
    if (err.code === "P2025") {
      return { status: 404, userMessage: "Recurso no encontrado" };
    }
  }

  // Error genérico (útil en dev)
  if (err instanceof Error) out.dev = err.message;

  return out;
}
