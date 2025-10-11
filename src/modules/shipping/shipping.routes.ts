import { Router } from "express";
import {
  createShippingMethod,
  deleteShippingMethod,
  getShippingMethodById,
  getShippingMethodsByStore,
  updateShippingMethod,
} from "./shipping.controller";
import { routeProtector } from "../../middlewares/routeProtector";
import { RolesEnum } from "../../core/enums";

const router = Router();

// Public route to get shipping methods for a store
router.get("/store/:storeId", getShippingMethodsByStore);
router.get("/:id", getShippingMethodById);

// Private routes for sellers to manage their shipping methods
router.post("/", routeProtector([RolesEnum.SELLER]), createShippingMethod);
router.patch("/:id", routeProtector([RolesEnum.SELLER]), updateShippingMethod);
router.delete("/:id", routeProtector([RolesEnum.SELLER]), deleteShippingMethod);

export default router;
