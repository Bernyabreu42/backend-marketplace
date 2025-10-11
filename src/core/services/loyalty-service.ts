import type { LoyaltyAccount, LoyaltyAction, LoyaltyTransaction, Prisma } from "@prisma/client";

import prisma from "../../database/prisma";

export const POINTS_PER_PESO = 1;
export const POINTS_TO_PESO_RATIO = 100;

type TxClient = Prisma.TransactionClient;

type AwardPointsOptions = {
  userId: string;
  actionKey?: string;
  multiplier?: number;
  points?: number;
  allowNegative?: boolean;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  metadata?: Prisma.JsonValue;
  tx?: TxClient;
};

type AwardPointsResult = {
  account: LoyaltyAccount;
  transaction: LoyaltyTransaction;
  action?: LoyaltyAction | null;
};

type RedeemPointsOptions = {
  userId: string;
  points: number;
  note?: string;
  tx?: TxClient;
};

async function runInTransaction<T>(tx: TxClient | undefined, cb: (client: TxClient) => Promise<T>): Promise<T> {
  if (tx) return cb(tx);
  return prisma.$transaction((client) => cb(client));
}

async function ensureAccountInternal(client: TxClient, userId: string): Promise<LoyaltyAccount> {
  return client.loyaltyAccount.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

export function calculatePointsForPurchase(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.floor(amount) * POINTS_PER_PESO;
}

export function calculateCashFromPoints(points: number): number {
  if (!Number.isFinite(points) || points <= 0) return 0;
  const pesos = points / POINTS_TO_PESO_RATIO;
  return Math.round(pesos * 100) / 100;
}

export async function ensureLoyaltyAccount(userId: string, tx?: TxClient) {
  return runInTransaction(tx, (client) => ensureAccountInternal(client, userId));
}

async function awardPointsInternal(
  client: TxClient,
  options: AwardPointsOptions
): Promise<AwardPointsResult> {
  const {
    userId,
    actionKey,
    multiplier,
    allowNegative = false,
    referenceType,
    referenceId,
    description,
    metadata,
  } = options;

  let { points } = options;

  const account = await ensureAccountInternal(client, userId);

  if (referenceType && referenceId) {
    const exists = await client.loyaltyTransaction.findFirst({
      where: {
        accountId: account.id,
        referenceType,
        referenceId,
      },
      select: { id: true },
    });

    if (exists) {
      throw new Error("Ya se registraron puntos para esta referencia");
    }
  }

  let action: LoyaltyAction | null = null;
  if (actionKey) {
    action = await client.loyaltyAction.findUnique({ where: { key: actionKey } });
    if (!action || !action.isActive) {
      throw new Error("La accion de lealtad no existe o no esta activa");
    }
  }

  if (points == null) {
    if (multiplier != null && action) {
      points = Math.floor(multiplier * action.defaultPoints);
    } else if (action) {
      points = action.defaultPoints;
    }
  }

  if (points == null || Number.isNaN(points)) {
    throw new Error("No se pudo calcular la cantidad de puntos a otorgar");
  }

  points = Math.trunc(points);

  if (!allowNegative && points <= 0) {
    throw new Error("Los puntos deben ser mayores a cero");
  }

  if (allowNegative && points === 0) {
    throw new Error("Los puntos a ajustar no pueden ser cero");
  }

  const newBalance = account.balance + points;
  if (newBalance < 0) {
    throw new Error("El usuario no cuenta con suficientes puntos disponibles");
  }

  const transaction = await client.loyaltyTransaction.create({
    data: {
      accountId: account.id,
      actionId: action?.id,
      userId,
      referenceType: referenceType ?? undefined,
      referenceId: referenceId ?? undefined,
      points,
      description: description ?? action?.description ?? undefined,
      metadata: metadata ?? undefined,
    },
  });

  const updatedAccount = await client.loyaltyAccount.update({
    where: { id: account.id },
    data: {
      balance: newBalance,
      lifetimeEarned: account.lifetimeEarned + (points > 0 ? points : 0),
      lifetimeRedeemed: account.lifetimeRedeemed + (points < 0 ? Math.abs(points) : 0),
    },
  });

  return {
    account: updatedAccount,
    transaction,
    action,
  };
}

export async function awardPoints(options: AwardPointsOptions): Promise<AwardPointsResult> {
  return runInTransaction(options.tx, (client) => awardPointsInternal(client, options));
}

export async function awardPointsForOrder(orderId: string, tx?: TxClient) {
  return runInTransaction(tx, async (client) => {
    const order = await client.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });

    if (!order) {
      throw new Error("Orden no encontrada");
    }

    const points = calculatePointsForPurchase(order.total);
    if (points <= 0) {
      return { skipped: true };
    }

    const { account, transaction } = await awardPointsInternal(client, {
      userId: order.userId,
      actionKey: "purchase",
      points,
      referenceType: "order",
      referenceId: order.id,
      description: `Puntos por compra (${order.total.toFixed(2)} pesos)` ,
      metadata: {
        orderId: order.id,
        storeId: order.storeId,
        total: order.total,
      },
    });

    return {
      account,
      transaction,
      points,
      skipped: false,
    };
  });
}

export async function redeemPoints(options: RedeemPointsOptions) {
  const { userId, note } = options;
  const points = Math.trunc(options.points);

  if (points <= 0) {
    throw new Error("Los puntos a canjear deben ser mayores a cero");
  }

  return runInTransaction(options.tx, async (client) => {
    const account = await ensureAccountInternal(client, userId);

    if (account.balance < points) {
      throw new Error("Saldo insuficiente para completar el canje");
    }

    const amount = calculateCashFromPoints(points);

    const redemption = await client.loyaltyRedemption.create({
      data: {
        accountId: account.id,
        userId,
        points,
        amount,
        note: note ?? undefined,
      },
    });

    const { account: updatedAccount, transaction } = await awardPointsInternal(client, {
      userId,
      points: -points,
      allowNegative: true,
      referenceType: "redemption",
      referenceId: redemption.id,
      description: note ?? "Canje de puntos",
      metadata: {
        redemptionId: redemption.id,
        amount,
      },
    });

    return {
      account: updatedAccount,
      transaction,
      redemption,
      amount,
    };
  });
}
