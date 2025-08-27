// src/types/express.d.ts
import "express";
import { RolesEnum } from "@/core/roles";

declare global {
  namespace Express {
    interface UserClaims {
      id: string;
      role?: RolesEnum;
    }
    interface Request {
      user?: UserClaims;
    }
  }
}
