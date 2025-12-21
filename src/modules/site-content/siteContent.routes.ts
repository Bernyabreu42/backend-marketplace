import { Router } from "express";

import { RolesEnum } from "../../core/enums";
import { routeProtector } from "../../middlewares/routeProtector";
import {
  createAnnouncementHandler,
  createCarouselHandler,
  createLegalDocumentHandler,
  createPromoModalHandler,
  deleteAnnouncementHandler,
  deleteCarouselHandler,
  deleteLegalDocumentHandler,
  deletePromoModalHandler,
  getAnnouncement,
  getCarousel,
  getCompanyProfileHandler,
  getLegalDocumentHandler,
  getPromoModal,
  getSiteContentPublic,
  listAnnouncementsHandler,
  listCarouselHandler,
  listLegalDocumentsHandler,
  listPromoModalsHandler,
  updateAnnouncementHandler,
  updateCarouselHandler,
  updateLegalDocumentHandler,
  updatePromoModalHandler,
  upsertCompanyProfileHandler,
} from "./siteContent.controller";

const router = Router();

router.get("/public", getSiteContentPublic);
router.get("/modal", getPromoModal);
router.get("/announcement", getAnnouncement);
router.get("/carousel", getCarousel);
router.get("/company", getCompanyProfileHandler);
router.get("/legal/:type", getLegalDocumentHandler);

router.use(routeProtector([RolesEnum.ADMIN, RolesEnum.SUPPORT]));

router.get("/modals", listPromoModalsHandler);
router.post("/modal", createPromoModalHandler);
router.patch("/modal/:id", updatePromoModalHandler);
router.delete("/modal/:id", deletePromoModalHandler);

router.get("/announcements", listAnnouncementsHandler);
router.post("/announcement", createAnnouncementHandler);
router.patch("/announcement/:id", updateAnnouncementHandler);
router.delete("/announcement/:id", deleteAnnouncementHandler);

router.get("/carousel/all", listCarouselHandler);
router.post("/carousel", createCarouselHandler);
router.patch("/carousel/:id", updateCarouselHandler);
router.delete("/carousel/:id", deleteCarouselHandler);

router.get("/legal", listLegalDocumentsHandler);
router.post("/legal", createLegalDocumentHandler);
router.patch("/legal/:id", updateLegalDocumentHandler);
router.delete("/legal/:id", deleteLegalDocumentHandler);

router.get("/company/admin", getCompanyProfileHandler);
router.put("/company", upsertCompanyProfileHandler);

export default router;
