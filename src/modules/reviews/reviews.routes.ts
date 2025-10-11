import { Router } from "express";
import {
  createReview,
  deleteReview,
  getReviewsByProduct,
  getReviewsByStore,
  updateReview,
} from "./reviews.controller";
import { routeProtector } from "../../middlewares/routeProtector";
import { RolesEnum } from "../../core/enums";

const router = Router();

router.get("/product/:productId", getReviewsByProduct);
router.get("/store/:storeId", getReviewsByStore);

router.post("/", routeProtector([RolesEnum.BUYER]), createReview);
router.patch(
  "/:id",
  routeProtector([RolesEnum.BUYER, RolesEnum.ADMIN]),
  updateReview
);
router.delete(
  "/:id",
  routeProtector([RolesEnum.BUYER, RolesEnum.ADMIN]),
  deleteReview
);

export default router;

