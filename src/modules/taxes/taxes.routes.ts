import { Router } from "express";
import {
  createTax,
  deleteTax,
  getAllTaxes,
  getTaxById,
  getTaxesByStore,
  RestaurarTax,
  updateTax,
} from "./taxes.controller";
import { routeProtector } from "../../middlewares/routeProtector";
import { RolesEnum } from "../../core/enums";

const router = Router();

router.get("/", getAllTaxes);
router.get(
  "/store/:storeId",
  routeProtector([RolesEnum.ADMIN, RolesEnum.SELLER]),
  getTaxesByStore
);
router.get("/:id", getTaxById);
router.post("/", routeProtector([RolesEnum.SELLER]), createTax);
router.patch("/:id", routeProtector([RolesEnum.SELLER]), updateTax);
router.delete("/:id", routeProtector([RolesEnum.SELLER]), deleteTax);
router.patch("/:id/restore", routeProtector([RolesEnum.SELLER]), RestaurarTax);

export default router;
