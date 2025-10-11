import type { Request, Response } from "express";

import { RolesEnum } from "../../core/enums";
import {
  awardPoints,
  awardPointsForOrder,
  calculateCashFromPoints,
  ensureLoyaltyAccount,
  redeemPoints,
  POINTS_TO_PESO_RATIO,
} from "../../core/services/loyalty-service";
import { ApiResponse } from "../../core/responses/ApiResponse";
import prisma from "../../database/prisma";
import {
  AccountQuerySchema,
  AssignPointsSchema,
  CreateActionSchema,
  IdParamSchema,
  OrderIdParamSchema,
  RedeemPointsSchema,
  UpdateActionSchema,
  UserIdParamSchema,
} from "./validator";
import { notifyLoyaltyPointsEarned } from "../../core/services/notificationService";

const mapParseError = (result: any) => {
  if (result.success) return null;
  const issue = result.error.issues?.[0];
  const message = issue?.message ?? "Datos invalidos";
  return ApiResponse.error({ message, error: result.error.flatten() });
};

export const listActions = async (_req: Request, res: Response) => {
  try {
    const actions = await prisma.loyaltyAction.findMany({
      orderBy: { createdAt: "desc" },
    });

    res.json(
      ApiResponse.success({
        data: actions,
        message: "Acciones de lealtad obtenidas",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudieron obtener las acciones",
        error,
      })
    );
  }
};

export const createAction = async (req: Request, res: Response) => {
  const parsed = CreateActionSchema.safeParse(req.body);
  const errorResponse = mapParseError(parsed);
  if (errorResponse) {
    res.status(400).json(errorResponse);
    return;
  }

  try {
    const action = await prisma.loyaltyAction.create({ data: parsed.data });
    res.status(201).json(
      ApiResponse.success({
        data: action,
        message: "Accion creada exitosamente",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo crear la accion",
        error,
      })
    );
  }
};

export const updateAction = async (req: Request, res: Response) => {
  const params = IdParamSchema.safeParse(req.params);
  const body = UpdateActionSchema.safeParse(req.body);

  const paramsError = mapParseError(params);
  if (paramsError) {
    res.status(400).json(paramsError);
    return;
  }

  const bodyError = mapParseError(body);
  if (bodyError) {
    res.status(400).json(bodyError);
    return;
  }

  try {
    const action = await prisma.loyaltyAction.update({
      where: { id: params.data.id },
      data: body.data,
    });

    res.json(
      ApiResponse.success({
        data: action,
        message: "Accion actualizada",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo actualizar la accion",
        error,
      })
    );
  }
};

export const assignPointsToUser = async (req: Request, res: Response) => {
  const parsed = AssignPointsSchema.safeParse(req.body);

  const errorResponse = mapParseError(parsed);
  if (errorResponse) {
    res.status(400).json(errorResponse);
    return;
  }

  try {
    const result = await awardPoints({
      userId: parsed?.data?.userId,
      actionKey: parsed?.data?.actionKey,
      points: parsed?.data?.points,
      multiplier: parsed?.data?.multiplier,
      referenceType: parsed?.data?.referenceType,
      referenceId: parsed?.data?.referenceId,
      description: parsed?.data?.description,
      metadata: parsed?.data?.metadata,
    });

    if (result.transaction.points > 0) {
      const user = await prisma.user.findUnique({
        where: { id: parsed.data.userId },
        select: { email: true, firstName: true },
      });

      notifyLoyaltyPointsEarned({
        to: user?.email,
        firstName: user?.firstName,
        points: result.transaction.points,
        balance: result.account.balance,
        description: result.transaction.description,
        contextLabel: result.action?.name ?? undefined,
      }).catch((error) =>
        console.error(
          "[mail] No se pudo enviar la notificacion de puntos asignados",
          error
        )
      );
    }

    res.json(
      ApiResponse.success({
        data: {
          account: result.account,
          transaction: result.transaction,
          action: result.action,
        },
        message: "Puntos asignados correctamente",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudieron asignar los puntos",
        error,
      })
    );
  }
};

export const getAccountByUserId = async (req: Request, res: Response) => {
  const params = UserIdParamSchema.safeParse(req.params);
  const query = AccountQuerySchema.safeParse(req.query);

  const paramsError = mapParseError(params);
  if (paramsError) {
    res.status(400).json(paramsError);
    return;
  }

  const queryError = mapParseError(query);
  if (queryError) {
    res.status(400).json(queryError);
    return;
  }

  try {
    const account = await ensureLoyaltyAccount(params.data.userId);
    const limit = query.data?.limit ?? 20;

    const transactions = await prisma.loyaltyTransaction.findMany({
      where: { accountId: account.id },
      include: { action: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const redeemablePoints =
      Math.floor(account.balance / POINTS_TO_PESO_RATIO) * POINTS_TO_PESO_RATIO;
    const redeemableAmount = calculateCashFromPoints(redeemablePoints);

    res.json(
      ApiResponse.success({
        data: {
          account,
          transactions,
          redeemablePoints,
          redeemableAmount,
        },
        message: "Cuenta de lealtad obtenida",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo obtener la cuenta",
        error,
      })
    );
  }
};

export const getMyAccount = async (req: Request, res: Response) => {
  const query = AccountQuerySchema.safeParse(req.query);
  const queryError = mapParseError(query);
  if (queryError) {
    res.status(400).json(queryError);
    return;
  }

  const userId = req.user?.id;
  if (!userId) {
    res
      .status(401)
      .json(ApiResponse.error({ message: "Usuario no autenticado" }));
    return;
  }

  try {
    const account = await ensureLoyaltyAccount(userId);
    const limit = query.data?.limit ?? 20;

    const transactions = await prisma.loyaltyTransaction.findMany({
      where: { accountId: account.id },
      include: { action: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const redeemablePoints =
      Math.floor(account.balance / POINTS_TO_PESO_RATIO) * POINTS_TO_PESO_RATIO;
    const redeemableAmount = calculateCashFromPoints(redeemablePoints);

    res.json(
      ApiResponse.success({
        data: {
          account,
          transactions,
          redeemablePoints,
          redeemableAmount,
        },
        message: "Cuenta de lealtad obtenida",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo obtener la cuenta",
        error,
      })
    );
  }
};

export const redeemPointsController = async (req: Request, res: Response) => {
  const parsed = RedeemPointsSchema.safeParse(req.body);
  const errorResponse = mapParseError(parsed);
  if (errorResponse) {
    res.status(400).json(errorResponse);
    return;
  }

  const requester = req.user;
  if (!requester) {
    res
      .status(401)
      .json(ApiResponse.error({ message: "Usuario no autenticado" }));
    return;
  }

  const userId = parsed.data.userId ?? requester.id;

  if (
    parsed.data.userId &&
    parsed.data.userId !== requester.id &&
    requester.role !== RolesEnum.ADMIN &&
    requester.role !== RolesEnum.SUPPORT
  ) {
    res.status(403).json(
      ApiResponse.error({
        message: "No tienes permisos para canjear por otro usuario",
      })
    );
    return;
  }

  try {
    const result = await redeemPoints({
      userId,
      points: parsed.data.points,
      note: parsed.data.note,
    });

    res.json(
      ApiResponse.success({
        data: result,
        message: "Canje realizado exitosamente",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo completar el canje",
        error,
      })
    );
  }
};

export const awardOrderPointsController = async (
  req: Request,
  res: Response
) => {
  const params = OrderIdParamSchema.safeParse(req.params);
  const errorResponse = mapParseError(params);
  if (errorResponse) {
    res.status(400).json(errorResponse);
    return;
  }

  try {
    const result = await awardPointsForOrder(params.data.orderId);

    if (!result.skipped && result.transaction?.points) {
      const orderUser = await prisma.order.findUnique({
        where: { id: params.data.orderId },
        select: {
          user: { select: { email: true, firstName: true } },
        },
      });

      notifyLoyaltyPointsEarned({
        to: orderUser?.user?.email,
        firstName: orderUser?.user?.firstName,
        points: result.transaction.points,
        balance: result.account.balance,
        description: result.transaction.description,
        contextLabel: "por tu compra",
      }).catch((error) =>
        console.error(
          "[mail] No se pudo enviar la notificacion de puntos por orden",
          error
        )
      );
    }

    res.json(
      ApiResponse.success({
        data: result,
        message: result.skipped
          ? "La orden no genera puntos por el monto registrado"
          : "Puntos de la orden registrados",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudieron registrar los puntos de la orden",
        error,
      })
    );
  }
};
