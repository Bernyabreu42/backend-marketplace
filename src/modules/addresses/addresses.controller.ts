import type { Request, Response } from "express";

import prisma from "../../database/prisma";
import { ApiResponse } from "../../core/responses/ApiResponse";
import {
  CreateAddressSchema,
  UpdateAddressSchema,
} from "./validator";

const addressSelect = {
  id: true,
  userId: true,
  label: true,
  address: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} as const;

const toPlainObject = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (typeof value === "object") {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
};

const trimString = (value: unknown) =>
  typeof value === "string" ? value.trim() : value ?? null;

const ADDRESS_KEYS = [
  "country",
  "state",
  "city",
  "postalCode",
  "street",
  "apartment",
  "note",
  "notes",
  "reference",
  "phone",
  "recipientName",
  "contactName",
] as const;

const normalizeAddressPayload = (payload?: Record<string, unknown>) => {
  if (!payload) return {};
  const plain = toPlainObject(payload);

  const normalizedEntries = ADDRESS_KEYS.reduce((acc, key) => {
    if (plain[key] !== undefined) {
      acc[key] = trimString(plain[key]);
    }
    return acc;
  }, {} as Record<string, unknown>);

  const noteValue =
    (typeof normalizedEntries.reference === "string" &&
      normalizedEntries.reference) ||
    (typeof normalizedEntries.notes === "string" && normalizedEntries.notes) ||
    (typeof normalizedEntries.note === "string" && normalizedEntries.note) ||
    normalizedEntries.reference ||
    normalizedEntries.notes ||
    normalizedEntries.note ||
    null;

  return Object.fromEntries(
    Object.entries({
      ...normalizedEntries,
      note: noteValue,
      notes: noteValue,
      reference: noteValue,
    }).filter(([, value]) => value !== undefined && value !== null)
  );
};

const extractAddressInput = (payload: Record<string, unknown>) => {
  if (payload.address && typeof payload.address === "object") {
    return toPlainObject(payload.address);
  }

  return ADDRESS_KEYS.reduce((acc, key) => {
    if (payload[key] !== undefined) {
      acc[key] = payload[key];
    }
    return acc;
  }, {} as Record<string, unknown>);
};

const sanitizeAddressResponse = (record: any) => {
  if (!record) return record;
  const { userId: _userId, isDefault, address, ...rest } = record;
  const parsedAddress = toPlainObject(address);
  const noteValue =
    (parsedAddress.reference as string | undefined) ??
    (parsedAddress.notes as string | undefined) ??
    (parsedAddress.note as string | undefined) ??
    null;

  const normalized = {
    label: rest.label ?? parsedAddress.label ?? null,
    country: parsedAddress.country ?? null,
    state: parsedAddress.state ?? parsedAddress.region ?? null,
    city: parsedAddress.city ?? null,
    postalCode: parsedAddress.postalCode ?? null,
    street: parsedAddress.street ?? parsedAddress.addressLine ?? null,
    reference: noteValue,
    isDefault: Boolean(isDefault),
    isPrimary: Boolean(isDefault),
  };

  return {
    ...rest,
    ...normalized,
    address: {
      ...parsedAddress,
      reference: noteValue,
    },
  };
};

export const listAddresses = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res
      .status(401)
      .json(ApiResponse.error({ message: "Autenticacion requerida" }));
    return;
  }

  try {
    const addresses = await prisma.userAddress.findMany({
      where: { userId: req.user.id },
      orderBy: [
        { isDefault: "desc" },
        { createdAt: "asc" },
      ],
      select: addressSelect,
    });

    res.json(
      ApiResponse.success({
        data: addresses.map(sanitizeAddressResponse),
        message: "Direcciones obtenidas",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al obtener direcciones",
        error,
      })
    );
  }
};

export const createAddress = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res
      .status(401)
      .json(ApiResponse.error({ message: "Autenticacion requerida" }));
    return;
  }

  const parsed = CreateAddressSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(
      ApiResponse.error({
        message: "Datos invalidos",
        error: parsed.error.format(),
      })
    );
    return;
  }

  try {
    const address = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.userAddress.count({
        where: { userId: req.user!.id },
      });

      const shouldBeDefault =
        parsed.data.isDefault ?? existingCount === 0;

      if (shouldBeDefault) {
        await tx.userAddress.updateMany({
          where: { userId: req.user!.id },
          data: { isDefault: false },
        });
      }

      const created = await tx.userAddress.create({
        data: {
          userId: req.user!.id,
          label: parsed.data.label,
          address: normalizeAddressPayload(
            extractAddressInput(parsed.data as unknown as Record<string, unknown>)
          ),
          isDefault: shouldBeDefault,
        },
        select: addressSelect,
      });

      return created;
    });

    res
      .status(201)
      .json(
        ApiResponse.success({
          data: sanitizeAddressResponse(address),
          message: "Direccion creada",
        })
      );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al crear direccion",
        error,
      })
    );
  }
};

export const updateAddress = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res
      .status(401)
      .json(ApiResponse.error({ message: "Autenticacion requerida" }));
    return;
  }

  const parsed = UpdateAddressSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(
      ApiResponse.error({
        message: "Datos invalidos",
        error: parsed.error.format(),
      })
    );
    return;
  }

  const addressId = req.params.id;
  if (!addressId) {
    res
      .status(400)
      .json(ApiResponse.error({ message: "ID de direccion invalido" }));
    return;
  }

  const existing = await prisma.userAddress.findFirst({
    where: { id: addressId, userId: req.user.id },
    select: addressSelect,
  });

  if (!existing) {
    res
      .status(404)
      .json(ApiResponse.error({ message: "Direccion no encontrada" }));
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const dataToUpdate: Record<string, unknown> = {};

      if (parsed.data.label !== undefined) {
        dataToUpdate.label = parsed.data.label;
      }

      const addressInput = extractAddressInput(
        parsed.data as unknown as Record<string, unknown>
      );
      if (Object.keys(addressInput).length > 0) {
        dataToUpdate.address = normalizeAddressPayload(addressInput);
      }

      if (parsed.data.isDefault === true) {
        await tx.userAddress.updateMany({
          where: { userId: req.user!.id },
          data: { isDefault: false },
        });
        dataToUpdate.isDefault = true;
      } else if (parsed.data.isDefault === false) {
        dataToUpdate.isDefault = false;
      }

      await tx.userAddress.update({
        where: { id: addressId },
        data: dataToUpdate,
      });

      if (
        parsed.data.isDefault === false &&
        existing.isDefault
      ) {
        const fallback = await tx.userAddress.findFirst({
          where: {
            userId: req.user!.id,
            id: { not: addressId },
          },
          orderBy: { createdAt: "asc" },
        });

        if (fallback) {
          await tx.userAddress.update({
            where: { id: fallback.id },
            data: { isDefault: true },
          });
        }
      }
    });

    const updated = await prisma.userAddress.findUnique({
      where: { id: addressId },
      select: addressSelect,
    });

    res.json(
      ApiResponse.success({
        data: sanitizeAddressResponse(updated),
        message: "Direccion actualizada",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al actualizar direccion",
        error,
      })
    );
  }
};

export const deleteAddress = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res
      .status(401)
      .json(ApiResponse.error({ message: "Autenticacion requerida" }));
    return;
  }

  const addressId = req.params.id;
  if (!addressId) {
    res
      .status(400)
      .json(ApiResponse.error({ message: "ID de direccion invalido" }));
    return;
  }

  const existing = await prisma.userAddress.findFirst({
    where: { id: addressId, userId: req.user.id },
  });

  if (!existing) {
    res
      .status(404)
      .json(ApiResponse.error({ message: "Direccion no encontrada" }));
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.userAddress.delete({ where: { id: addressId } });

      if (existing.isDefault) {
        const fallback = await tx.userAddress.findFirst({
          where: { userId: req.user!.id },
          orderBy: { createdAt: "asc" },
        });

        if (fallback) {
          await tx.userAddress.update({
            where: { id: fallback.id },
            data: { isDefault: true },
          });
        }
      }
    });

    res.json(
      ApiResponse.success({
        message: "Direccion eliminada",
        data: null,
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error al eliminar direccion",
        error,
      })
    );
  }
};
