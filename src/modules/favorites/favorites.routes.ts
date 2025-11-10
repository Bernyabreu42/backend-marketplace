import { Router } from "express";

import { routeProtector } from "../../middlewares/routeProtector";
import {
  addFavorite,
  getFavorites,
  removeFavorite,
} from "./favorites.controller";
import { RolesEnum } from "../../core/enums";

const router = Router();

router.get("/", routeProtector([RolesEnum.BUYER]), getFavorites);
router.post("/:productId", routeProtector([RolesEnum.BUYER]), addFavorite);
router.delete("/:productId", routeProtector([RolesEnum.BUYER]), removeFavorite);

export default router;
