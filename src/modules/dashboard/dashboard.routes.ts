import { Router } from "express";

import { RolesEnum } from "../../core/enums";
import { routeProtector } from "../../middlewares/routeProtector";
import {
  getLoyaltyStats,
  getOrdersStatus,
  getOverview,
  getSalesSeries,
  getTopProductsHandler,
} from "./dashboard.controller";

const router = Router();

router.use(routeProtector([RolesEnum.ADMIN, RolesEnum.SUPPORT]));

router.get("/overview", getOverview);
router.get("/sales", getSalesSeries);
router.get("/orders/status", getOrdersStatus);
router.get("/loyalty", getLoyaltyStats);
router.get("/top-products", getTopProductsHandler);

export default router;
