import type { Request } from "express";

import { RolesEnum } from "../../../core/enums";
import prisma from "../../../database/prisma";
import { verifyAccessToken } from "../../../utils/jwt";

export type RequesterContext = {
  id: string;
  role: RolesEnum;
};

export const isAdminOrSupport = (requester: RequesterContext | null) =>
  requester?.role === RolesEnum.ADMIN || requester?.role === RolesEnum.SUPPORT;

export const hasStoreVisibility = (
  requester: RequesterContext | null,
  ownerId?: string | null
) => {
  if (!requester) return false;
  if (ownerId && requester.id === ownerId) return true;
  return isAdminOrSupport(requester);
};

export const buildProductVisibilityFilter = (
  requester: RequesterContext | null
) => {
  if (isAdminOrSupport(requester)) {
    return { store: { isDeleted: false } };
  }

  const activeProductFilter = {
    status: "active" as const,
    store: { status: "active" as const, isDeleted: false },
  };

  if (!requester) {
    return activeProductFilter;
  }

  return {
    OR: [
      activeProductFilter,
      {
        store: { ownerId: requester.id, isDeleted: false },
      },
    ],
  };
};

export const resolveRequester = async (
  req: Request
): Promise<RequesterContext | null> => {
  if (req.user?.id && req.user?.role) {
    return {
      id: req.user.id,
      role: req.user.role as RolesEnum,
    };
  }

  const accessToken = req.cookies?.accessToken;
  if (!accessToken) return null;

  try {
    const payload = verifyAccessToken(accessToken) as {
      sub?: string;
      id?: string;
    };
    const userId = payload?.sub ?? payload?.id;
    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) return null;

    return {
      id: user.id,
      role: user.role as RolesEnum,
    };
  } catch {
    return null;
  }
};
