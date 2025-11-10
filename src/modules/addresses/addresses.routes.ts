import { Router } from "express";

import { routeProtector } from "../../middlewares/routeProtector";
import {
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
} from "./addresses.controller";

const router = Router();

router.get("/", routeProtector(), listAddresses);
router.post("/", routeProtector(), createAddress);
router.patch("/:id", routeProtector(), updateAddress);
router.delete("/:id", routeProtector(), deleteAddress);

export default router;
