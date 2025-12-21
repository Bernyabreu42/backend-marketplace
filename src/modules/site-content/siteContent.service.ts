import type {
  AnnouncementBar,
  CarouselSlide,
  CompanyProfile,
  LegalDocument,
  LegalDocumentType,
  Prisma,
  PromoModal,
  PromoModalKind,
} from "@prisma/client";

import prisma from "../../database/prisma";

const activeWindowFilter = (now: Date) => ({
  isActive: true,
  AND: [
    { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
    { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
  ],
});

export const getActivePromoModal = (now = new Date()) =>
  prisma.promoModal.findFirst({
    where: activeWindowFilter(now),
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });

export const listPromoModals = () =>
  prisma.promoModal.findMany({ orderBy: [{ createdAt: "desc" }] });

export const createPromoModal = (
  data: Prisma.PromoModalUncheckedCreateInput
) => prisma.promoModal.create({ data });

export const updatePromoModal = (
  id: string,
  data: Prisma.PromoModalUncheckedUpdateInput
) => prisma.promoModal.update({ where: { id }, data });

export const deletePromoModal = (id: string) =>
  prisma.promoModal.delete({ where: { id } });

export const getActivePromoModalsByKind = async (now = new Date()) => {
  const modals = await prisma.promoModal.findMany({
    where: activeWindowFilter(now),
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
  const byKind = modals.reduce<
    Partial<Record<PromoModalKind, PromoModal | null>>
  >((acc, modal) => {
    if (!acc[modal.kind]) {
      acc[modal.kind] = modal;
    }
    return acc;
  }, {});
  return byKind;
};

export const getActiveAnnouncement = (now = new Date()) =>
  prisma.announcementBar.findFirst({
    where: activeWindowFilter(now),
    orderBy: [{ createdAt: "desc" }],
  });

export const listAnnouncements = () =>
  prisma.announcementBar.findMany({
    orderBy: [{ createdAt: "desc" }],
  });

export const createAnnouncement = (
  data: Prisma.AnnouncementBarUncheckedCreateInput
) => prisma.announcementBar.create({ data });

export const updateAnnouncement = (
  id: string,
  data: Prisma.AnnouncementBarUncheckedUpdateInput
) => prisma.announcementBar.update({ where: { id }, data });

export const deleteAnnouncement = (id: string) =>
  prisma.announcementBar.delete({ where: { id } });

export const getActiveCarouselSlides = (now = new Date()) =>
  prisma.carouselSlide.findMany({
    where: activeWindowFilter(now),
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });

export const listCarouselSlides = () =>
  prisma.carouselSlide.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });

export const createCarouselSlide = (
  data: Prisma.CarouselSlideUncheckedCreateInput
) => prisma.carouselSlide.create({ data });

export const updateCarouselSlide = (
  id: string,
  data: Prisma.CarouselSlideUncheckedUpdateInput
) => prisma.carouselSlide.update({ where: { id }, data });

export const deleteCarouselSlide = (id: string) =>
  prisma.carouselSlide.delete({ where: { id } });

export const getCompanyProfile = () =>
  prisma.companyProfile.findFirst({
    orderBy: { updatedAt: "desc" },
  });

export const upsertCompanyProfile = async (
  data: Prisma.CompanyProfileUncheckedCreateInput & { id?: string }
): Promise<CompanyProfile> => {
  if (data.id) {
    const { id, ...rest } = data;
    return prisma.companyProfile.update({ where: { id }, data: rest });
  }

  return prisma.companyProfile.create({ data });
};

export const listLegalDocuments = () =>
  prisma.legalDocument.findMany({
    orderBy: [{ type: "asc" }, { publishedAt: "desc" }],
  });

export const getLegalByType = (type: LegalDocumentType) =>
  prisma.legalDocument.findFirst({
    where: { type, isActive: true },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
  });

export const createLegalDocument = (
  data: Prisma.LegalDocumentUncheckedCreateInput
) => prisma.legalDocument.create({ data });

export const updateLegalDocument = (
  id: string,
  data: Prisma.LegalDocumentUncheckedUpdateInput
) => prisma.legalDocument.update({ where: { id }, data });

export const deleteLegalDocument = (id: string) =>
  prisma.legalDocument.delete({ where: { id } });

export const getPublicSiteContent = async () => {
  const now = new Date();
  const [modal, modalsByKind, announcement, carousel, company, legalDocs] =
    await Promise.all([
      getActivePromoModal(now),
      getActivePromoModalsByKind(now),
      getActiveAnnouncement(now),
      getActiveCarouselSlides(now),
      getCompanyProfile(),
      prisma.legalDocument.findMany({
        where: { isActive: true },
        orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      }),
    ]);

  const legal = legalDocs.reduce<Record<LegalDocumentType, LegalDocument>>(
    (acc, doc) => {
      if (!acc[doc.type]) acc[doc.type] = doc;
      return acc;
    },
    {} as Record<LegalDocumentType, LegalDocument>
  );

  return { modal, modalsByKind, announcement, carousel, company, legal };
};
