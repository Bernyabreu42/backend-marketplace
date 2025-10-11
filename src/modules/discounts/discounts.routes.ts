import { Router } from "express";

import { RolesEnum } from "../../core/enums";
import { routeProtector } from "../../middlewares/routeProtector";
import {
  createDiscount,
  deleteDiscount,
  getAllDiscounts,
  getDiscountById,
  getDiscountsByStore,
  restoreDiscount,
  updateDiscount,
} from "./discounts.controller";

const router = Router();

router.get("/", getAllDiscounts);
router.get(
  "/store/:storeId",
  routeProtector([RolesEnum.ADMIN, RolesEnum.SELLER]),
  getDiscountsByStore
);
router.get("/:id", getDiscountById);
router.post("/", routeProtector([RolesEnum.SELLER]), createDiscount);
router.patch("/:id", routeProtector([RolesEnum.SELLER]), updateDiscount);
router.delete("/:id", routeProtector([RolesEnum.SELLER]), deleteDiscount);
router.patch("/:id/restore", routeProtector([RolesEnum.SELLER]), restoreDiscount);

export default router;
