import { Router } from "express";

import { RolesEnum } from "../../core/enums";
import { routeProtector } from "../../middlewares/routeProtector";
import {
  createOrder,
  getOrderById,
  listMyOrders,
  listOrders,
  listStoreOrders,
  updateOrderStatus,
} from "./orders.controller";

const router = Router();

router.get(
  "/",
  routeProtector([RolesEnum.ADMIN, RolesEnum.SUPPORT]),
  listOrders
);

router.get("/my", routeProtector(), listMyOrders);

router.get("/store", routeProtector([RolesEnum.SELLER]), listStoreOrders);

router.get("/:id", routeProtector(), getOrderById);

router.post("/", routeProtector(), createOrder);

router.patch(
  "/:id/status",
  routeProtector([RolesEnum.ADMIN, RolesEnum.SUPPORT, RolesEnum.SELLER]),
  updateOrderStatus
);

export default router;
