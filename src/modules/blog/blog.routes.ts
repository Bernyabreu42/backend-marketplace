import { Router } from "express";

import { RolesEnum } from "../../core/enums";
import { routeProtector } from "../../middlewares/routeProtector";
import {
  createBlogPost,
  deleteBlogPost,
  getBlogPostBySlug,
  listBlogPosts,
  updateBlogPost,
} from "./blog.controller";

const router = Router();

router.get("/", listBlogPosts);
router.get("/:slug", getBlogPostBySlug);

router.post(
  "/",
  routeProtector([RolesEnum.ADMIN, RolesEnum.SUPPORT]),
  createBlogPost
);

router.patch(
  "/:id",
  routeProtector([RolesEnum.ADMIN, RolesEnum.SUPPORT]),
  updateBlogPost
);

router.delete(
  "/:id",
  routeProtector([RolesEnum.ADMIN, RolesEnum.SUPPORT]),
  deleteBlogPost
);

export default router;
