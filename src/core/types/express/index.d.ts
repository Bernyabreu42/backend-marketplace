import type { RolesEnum } from "../../enums";

type RequestStore = {
  id: string;
  ownerId: string;
  status: string;
};

declare global {
  namespace Express {
    interface UserClaims {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      displayName: string | null;
      username: string | null;
      status: string;
      emailVerified: boolean;
      role: RolesEnum;
      profileImage: string | null;
      store: RequestStore | null;
    }

    interface Request {
      user?: UserClaims;
    }
  }
}

export {};
