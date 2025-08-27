import { Router } from "express";
// import { upload } from "../../middlewares/upload.middleware";
import { uploadMultiple, uploadSingle } from "./upload.controller";
import multer from "multer";

const router = Router();
const upload = multer();

router.post("/single", upload.single("image"), uploadSingle);
router.post("/multiple", upload.array("images", 5), uploadMultiple);

export default router;
