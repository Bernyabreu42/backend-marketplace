import { Router } from "express";
import {
  createProduct,
  createRelatedProducts,
  deleteProduct,
  getAllProducts,
  getProductById,
  getProductByStore,
  getRelatedProducts,
  getFeaturedProductsController,
  searchProducts,
  searchProductsByStore,
  updateProduct,
} from "./products.controller";
import { routeProtector } from "../../middlewares/routeProtector";
import { RolesEnum } from "../../core/enums";

const router = Router();

// Productos generales (publicos o protegidos segun necesidad)

// Listados y consultas especificas
router.get("/", getAllProducts); // Listar todos los productos
router.get("/featured", getFeaturedProductsController); // Productos destacados
router.get("/search", searchProducts); // Busqueda global en marketplace
router.get("/store/:storeId/search", searchProductsByStore); // Busqueda en tienda
router.get("/store/:storeId", getProductByStore); // Productos por tienda
router.get("/:id/related", getRelatedProducts); // Productos relacionados
router.get("/:id", getProductById); // Producto individual

// Creacion y modificacion
router.post(
  "/",
  routeProtector([RolesEnum.ADMIN, RolesEnum.SELLER]),
  createProduct
);

router.post(
  "/:id/related",
  routeProtector([RolesEnum.ADMIN, RolesEnum.SELLER]),
  createRelatedProducts
);

router.patch("/:id", routeProtector([RolesEnum.SELLER]), updateProduct);

router.delete("/:id", routeProtector([RolesEnum.SELLER]), deleteProduct);

export default router;
