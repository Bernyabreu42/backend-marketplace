import * as loyaltyService from "../../core/services/loyalty-service";
import prisma from "../../database/prisma";
import { notifyLoyaltyPointsEarned } from "../../core/services/notificationService";

type AwardExecutor = (orderId: string) => Promise<unknown>;

type OrderEntity = { id: string };

type PrismaOrderDelegate = typeof prisma.order;

type PatchedOrderDelegate = PrismaOrderDelegate & {
  __originalCreate?: PrismaOrderDelegate["create"];
};

const globalState = globalThis as unknown as {
  __orderLoyaltyHookRegistered?: boolean;
  __orderLoyaltyAwardExecutor?: AwardExecutor;
};

const defaultExecutor: AwardExecutor = async (orderId) => {
  const result = await loyaltyService.awardPointsForOrder(orderId);

  if (!result || result.skipped || !result.transaction?.points) {
    return;
  }

  const orderUser = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      user: { select: { email: true, firstName: true } },
    },
  });

  if (!orderUser?.user?.email) return;

  notifyLoyaltyPointsEarned({
    to: orderUser.user.email,
    firstName: orderUser.user.firstName,
    points: result.transaction.points,
    balance: result.account.balance,
    description: result.transaction.description,
    contextLabel: "por tu compra",
  }).catch((error) =>
    console.error(
      "[mail] No se pudo enviar la notificacion automatica de puntos",
      error
    )
  );
};

export const setLoyaltyAwardExecutor = (executor?: AwardExecutor) => {
  if (executor) {
    globalState.__orderLoyaltyAwardExecutor = executor;
    return;
  }
  delete globalState.__orderLoyaltyAwardExecutor;
};

const orderDelegate = prisma.order as PatchedOrderDelegate;

if (!globalState.__orderLoyaltyHookRegistered) {
  if (!orderDelegate.__originalCreate) {
    orderDelegate.__originalCreate = orderDelegate.create;
  }

  const originalCreate = orderDelegate.__originalCreate!;

  orderDelegate.create = (async function orderCreateWrapper(
    this: typeof orderDelegate,
    ...args
  ) {
    const result = (await originalCreate.apply(this, args)) as OrderEntity | unknown;

    if (result && typeof (result as OrderEntity).id === "string") {
      const orderId = (result as OrderEntity).id;
      queueMicrotask(() => {
        const executor =
          globalState.__orderLoyaltyAwardExecutor ?? defaultExecutor;
        executor(orderId).catch((error) =>
          console.error(
            "[loyalty] No se pudieron asignar puntos para la orden",
            error
          )
        );
      });
    }

    return result as Awaited<ReturnType<PrismaOrderDelegate["create"]>>;
  }) as PrismaOrderDelegate["create"];

  globalState.__orderLoyaltyHookRegistered = true;
}
