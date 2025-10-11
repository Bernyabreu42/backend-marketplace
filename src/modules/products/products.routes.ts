import { Router } from "express";
import {
  createProduct,
  createRelatedProducts,
  deleteProduct,
  getAllProducts,
  getProductById,
  getProductByStore,
  getRelatedProducts,
  updateProduct,
} from "./products.controller";
import { routeProtector } from "../../middlewares/routeProtector";
import { RolesEnum } from "../../core/enums";

const router = Router();

// Productos generales (públicos o protegidos según necesidad)
router.get("/", getAllProducts); // Listar todos los productos
router.get("/:id", getProductById); // Producto individual
router.get("/store/:storeId", getProductByStore); // Productos por tienda
router.get("/:id/related", getRelatedProducts); // Productos relacionados

router.post(
  "/",
  routeProtector([RolesEnum.ADMIN, RolesEnum.SELLER]),
  createProduct
);

router.post(
  "/:id/related",
  routeProtector([RolesEnum.SELLER]),
  createRelatedProducts
);

router.patch("/:id", routeProtector([RolesEnum.SELLER]), updateProduct);

router.delete("/:id", routeProtector([RolesEnum.SELLER]), deleteProduct);

export default router;

