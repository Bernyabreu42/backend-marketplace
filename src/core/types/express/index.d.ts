import { UserEntity } from "../entities/UserEntity"; // O el tipo que uses

// Puedes usar UserEntity si quieres tipado fuerte: user?: UserEntity

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}
