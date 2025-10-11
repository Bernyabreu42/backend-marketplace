import { Router } from "express";

import { RolesEnum } from "../../core/enums";
import { routeProtector } from "../../middlewares/routeProtector";
import {
  createPromotion,
  deletePromotion,
  getAllPromotions,
  getPromotionById,
  getPromotionsByStore,
  restorePromotion,
  updatePromotion,
} from "./promotions.controller";

const router = Router();

router.get("/", getAllPromotions);
router.get(
  "/store/:storeId",
  routeProtector([RolesEnum.ADMIN, RolesEnum.SELLER]),
  getPromotionsByStore
);
router.get("/:id", getPromotionById);
router.post("/", routeProtector([RolesEnum.SELLER]), createPromotion);
router.patch("/:id", routeProtector([RolesEnum.SELLER]), updatePromotion);
router.delete("/:id", routeProtector([RolesEnum.SELLER]), deletePromotion);
router.patch("/:id/restore", routeProtector([RolesEnum.SELLER]), restorePromotion);

export default router;
