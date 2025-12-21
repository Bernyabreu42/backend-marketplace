import { Router } from "express";
import multer from "multer";
import { RolesEnum } from "../../core/enums";
import { routeProtector } from "../../middlewares/routeProtector";
import {
  deleteUploadResource,
  listUploadResources,
  renameUploadResource,
  uploadMultiple,
  uploadSingle,
} from "./upload.controller";

const router = Router();
const upload = multer();

router.use(routeProtector());

router.get("/assets", listUploadResources);
router.delete("/assets", deleteUploadResource);
router.patch("/assets/rename", renameUploadResource);
router.post("/single", upload.single("image"), uploadSingle);
router.post("/multiple", upload.array("images", 5), uploadMultiple);

export default router;
