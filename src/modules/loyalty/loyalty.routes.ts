import { Router } from "express";

import { RolesEnum } from "../../core/enums";
import { routeProtector } from "../../middlewares/routeProtector";
import {
  assignPointsToUser,
  awardOrderPointsController,
  createAction,
  getAccountByUserId,
  getMyAccount,
  listActions,
  redeemPointsController,
  updateAction,
} from "./loyalty.controller";

const router = Router();

router.get(
  "/actions",
  routeProtector([RolesEnum.ADMIN, RolesEnum.SUPPORT]),
  listActions
);

router.post("/actions", routeProtector([RolesEnum.ADMIN]), createAction);
router.patch("/actions/:id", routeProtector([RolesEnum.ADMIN]), updateAction);

router.get("/accounts/me", routeProtector(), getMyAccount);
router.get(
  "/accounts/:userId",
  routeProtector([RolesEnum.ADMIN, RolesEnum.SUPPORT]),
  getAccountByUserId
);

router.post(
  "/assign",
  routeProtector([RolesEnum.ADMIN, RolesEnum.SUPPORT]),
  assignPointsToUser
);

router.post("/redeem", routeProtector(), redeemPointsController);

router.post(
  "/orders/:orderId/award",
  routeProtector([RolesEnum.ADMIN, RolesEnum.SUPPORT]),
  awardOrderPointsController
);

export default router;
