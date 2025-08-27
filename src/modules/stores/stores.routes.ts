import { Router } from "express";
import { routeProtector } from "../../middlewares/routeProtector";
import { RolesEnum } from "../../core/enums";
import {
  createStore,
  deleteStore,
  getAllStores,
  getStore,
  updateStore,
  updateStoreStatus,
  uploadStoreImages,
} from "./stores.controller";
import { validate } from "../../middlewares/zodValidator";
import { updateStoreStatusSchema } from "../../core/validations/stores";

const router = Router();

router.post("/create", routeProtector([RolesEnum.BUYER]), createStore);

router.get(
  "/all",
  routeProtector([RolesEnum.ADMIN, RolesEnum.SUPPORT]),
  getAllStores
);

router.patch("/update/:id", routeProtector([RolesEnum.SELLER]), updateStore);

router.get("/:id", routeProtector(), getStore);

router.patch(
  "/:storeId/status",
  routeProtector([RolesEnum.ADMIN]),
  validate(updateStoreStatusSchema),
  updateStoreStatus
);

router.delete(
  "/:storeId",
  routeProtector([RolesEnum.ADMIN, RolesEnum.SELLER]),
  deleteStore
);

router.patch("/update-image", routeProtector(), uploadStoreImages);

export default router;
