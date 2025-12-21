import { Router } from "express";
import {
  createCategory,
  deleteCategory,
  getAllCategories,
  getCategoryById,
  getCategoriesTree,
  updateCategory,
} from "./category.controller";
import { routeProtector } from "../../middlewares/routeProtector";
import { RolesEnum } from "../../core/enums";

const router = Router();

// Públicas
router.get("/", getAllCategories);
router.get("/tree", getCategoriesTree);
// router.get("/store/:storeId", getCategoriesByStore);

// Privadas (solo admin u otros roles permitidos)
router.get("/:id", routeProtector([RolesEnum.ADMIN]), getCategoryById);
router.post("/", routeProtector([RolesEnum.ADMIN]), createCategory);
router.patch("/:id", routeProtector([RolesEnum.ADMIN]), updateCategory);
router.delete("/:id", routeProtector([RolesEnum.ADMIN]), deleteCategory);

export default router;
