import { Router } from "express";
import {
  changePassword,
  createUser,
  deleteUser,
  getOnlyUser,
  getUsers,
  updateUser,
  uploadProfileImage,
} from "./user.controller";
import { routeProtector } from "../../middlewares/routeProtector";

const router = Router();

router.get("/", getUsers);
router.get("/:id", getOnlyUser);
router.post("/create", createUser);
router.patch("/update/:id", routeProtector(), updateUser);
router.delete("/:id", routeProtector(), deleteUser);
router.patch("/change-password", routeProtector(), changePassword);
router.patch("/profile-image", routeProtector(), uploadProfileImage);

export default router;
