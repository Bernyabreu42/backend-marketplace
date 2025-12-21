import type { Request, Response } from "express";
import { LegalDocumentType, Prisma } from "@prisma/client";

import { ApiResponse } from "../../core/responses/ApiResponse";
import {
  createAnnouncement,
  createCarouselSlide,
  createLegalDocument,
  createPromoModal,
  deleteAnnouncement,
  deleteCarouselSlide,
  deleteLegalDocument,
  deletePromoModal,
  getActiveAnnouncement,
  getActiveCarouselSlides,
  getActivePromoModal,
  getCompanyProfile,
  getLegalByType,
  getPublicSiteContent,
  listAnnouncements,
  listCarouselSlides,
  listLegalDocuments,
  listPromoModals,
  upsertCompanyProfile,
  updateAnnouncement,
  updateCarouselSlide,
  updateLegalDocument,
  updatePromoModal,
} from "./siteContent.service";
import {
  AnnouncementCreateSchema,
  AnnouncementUpdateSchema,
  CarouselSlideCreateSchema,
  CarouselSlideUpdateSchema,
  CompanyProfileUpsertSchema,
  IdParamSchema,
  LegalDocumentCreateSchema,
  LegalDocumentUpdateSchema,
  LegalQuerySchema,
  PromoModalCreateSchema,
  PromoModalUpdateSchema,
} from "./validator";

const mapValidationError = (parsed: any) => {
  if (parsed.success) return null;
  const issue = parsed.error?.issues?.[0];
  const message = issue?.message ?? "Datos invalidos";
  return ApiResponse.error({ message, error: parsed.error.flatten() });
};

const normalizeNullable = <T>(value: T | null | undefined) =>
  value === undefined ? undefined : value ?? null;

const normalizeDate = (value: Date | null | undefined) =>
  value === undefined ? undefined : value ?? null;

const handlePrismaNotFound = (error: unknown, res: Response, message: string) => {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  ) {
    res.status(404).json(ApiResponse.error({ message }));
    return true;
  }
  return false;
};

export const getSiteContentPublic = async (_req: Request, res: Response) => {
  try {
    const data = await getPublicSiteContent();
    res.json(
      ApiResponse.success({
        data,
        message: "Contenido del sitio",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo obtener el contenido",
        error,
      })
    );
  }
};

export const getPromoModal = async (_req: Request, res: Response) => {
  try {
    const modal = await getActivePromoModal();
    if (!modal) {
      res.status(204).send();
      return;
    }

    res.json(ApiResponse.success({ data: modal, message: "Modal activo" }));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({ message: "No se pudo obtener el modal", error })
    );
  }
};

export const listPromoModalsHandler = async (_req: Request, res: Response) => {
  try {
    const modals = await listPromoModals();
    res.json(
      ApiResponse.success({ data: modals, message: "Modales encontrados" })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({ message: "No se pudo listar los modales", error })
    );
  }
};

export const createPromoModalHandler = async (req: Request, res: Response) => {
  const parsed = PromoModalCreateSchema.safeParse(req.body);
  const errorResponse = mapValidationError(parsed);
  if (errorResponse) {
    res.status(400).json(errorResponse);
    return;
  }

  try {
    const payload = parsed.data;
    const modal = await createPromoModal({
      title: payload.title ?? null,
      description: payload.description ?? null,
      imageUrl: payload.imageUrl,
      altText: payload.altText ?? null,
      targetUrl: payload.targetUrl ?? null,
      kind: payload.kind ?? "promo",
      isActive: payload.isActive ?? true,
      startsAt: payload.startsAt ?? null,
      endsAt: payload.endsAt ?? null,
      priority: payload.priority ?? 0,
    });

    res
      .status(201)
      .json(ApiResponse.success({ data: modal, message: "Modal creado" }));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({ message: "No se pudo crear el modal", error })
    );
  }
};

export const updatePromoModalHandler = async (req: Request, res: Response) => {
  const params = IdParamSchema.safeParse(req.params);
  const body = PromoModalUpdateSchema.safeParse(req.body);

  const paramsError = mapValidationError(params);
  if (paramsError) {
    res.status(400).json(paramsError);
    return;
  }

  const bodyError = mapValidationError(body);
  if (bodyError) {
    res.status(400).json(bodyError);
    return;
  }

  try {
    const payload = body.data;
    const modal = await updatePromoModal(params.data.id, {
      title: normalizeNullable(payload.title),
      description: normalizeNullable(payload.description),
      imageUrl: payload.imageUrl,
      altText: normalizeNullable(payload.altText),
      targetUrl: normalizeNullable(payload.targetUrl),
      kind: payload.kind,
      isActive: payload.isActive,
      startsAt: normalizeDate(payload.startsAt),
      endsAt: normalizeDate(payload.endsAt),
      priority: payload.priority,
    });

    res.json(
      ApiResponse.success({ data: modal, message: "Modal actualizado" })
    );
  } catch (error) {
    if (handlePrismaNotFound(error, res, "Modal no encontrado")) return;
    res.status(500).json(
      ApiResponse.error({ message: "No se pudo actualizar el modal", error })
    );
  }
};

export const deletePromoModalHandler = async (req: Request, res: Response) => {
  const parsed = IdParamSchema.safeParse(req.params);
  const paramsError = mapValidationError(parsed);
  if (paramsError) {
    res.status(400).json(paramsError);
    return;
  }

  try {
    await deletePromoModal(parsed.data.id);
    res.json(ApiResponse.success({ message: "Modal eliminado" }));
  } catch (error) {
    if (handlePrismaNotFound(error, res, "Modal no encontrado")) return;
    res.status(500).json(
      ApiResponse.error({ message: "No se pudo eliminar el modal", error })
    );
  }
};

export const getAnnouncement = async (_req: Request, res: Response) => {
  try {
    const announcement = await getActiveAnnouncement();
    if (!announcement) {
      res.status(204).send();
      return;
    }
    res.json(
      ApiResponse.success({
        data: announcement,
        message: "Anuncio activo",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo obtener el anuncio",
        error,
      })
    );
  }
};

export const listAnnouncementsHandler = async (_req: Request, res: Response) => {
  try {
    const announcements = await listAnnouncements();
    res.json(
      ApiResponse.success({
        data: announcements,
        message: "Anuncios encontrados",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudieron listar los anuncios",
        error,
      })
    );
  }
};

export const createAnnouncementHandler = async (
  req: Request,
  res: Response
) => {
  const parsed = AnnouncementCreateSchema.safeParse(req.body);
  const errorResponse = mapValidationError(parsed);
  if (errorResponse) {
    res.status(400).json(errorResponse);
    return;
  }

  try {
    const payload = parsed.data;
    const announcement = await createAnnouncement({
      message: payload.message,
      targetUrl: payload.targetUrl ?? null,
      backgroundColor: payload.backgroundColor ?? null,
      textColor: payload.textColor ?? null,
      isActive: payload.isActive ?? true,
      startsAt: payload.startsAt ?? null,
      endsAt: payload.endsAt ?? null,
    });

    res.status(201).json(
      ApiResponse.success({
        data: announcement,
        message: "Anuncio creado",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo crear el anuncio",
        error,
      })
    );
  }
};

export const updateAnnouncementHandler = async (
  req: Request,
  res: Response
) => {
  const params = IdParamSchema.safeParse(req.params);
  const body = AnnouncementUpdateSchema.safeParse(req.body);

  const paramsError = mapValidationError(params);
  if (paramsError) {
    res.status(400).json(paramsError);
    return;
  }

  const bodyError = mapValidationError(body);
  if (bodyError) {
    res.status(400).json(bodyError);
    return;
  }

  try {
    const payload = body.data;
    const announcement = await updateAnnouncement(params.data.id, {
      message: payload.message,
      targetUrl: normalizeNullable(payload.targetUrl),
      backgroundColor: normalizeNullable(payload.backgroundColor),
      textColor: normalizeNullable(payload.textColor),
      isActive: payload.isActive,
      startsAt: normalizeDate(payload.startsAt),
      endsAt: normalizeDate(payload.endsAt),
    });

    res.json(
      ApiResponse.success({
        data: announcement,
        message: "Anuncio actualizado",
      })
    );
  } catch (error) {
    if (handlePrismaNotFound(error, res, "Anuncio no encontrado")) return;
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo actualizar el anuncio",
        error,
      })
    );
  }
};

export const deleteAnnouncementHandler = async (
  req: Request,
  res: Response
) => {
  const parsed = IdParamSchema.safeParse(req.params);
  const paramsError = mapValidationError(parsed);
  if (paramsError) {
    res.status(400).json(paramsError);
    return;
  }

  try {
    await deleteAnnouncement(parsed.data.id);
    res.json(ApiResponse.success({ message: "Anuncio eliminado" }));
  } catch (error) {
    if (handlePrismaNotFound(error, res, "Anuncio no encontrado")) return;
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo eliminar el anuncio",
        error,
      })
    );
  }
};

export const getCarousel = async (_req: Request, res: Response) => {
  try {
    const slides = await getActiveCarouselSlides();
    res.json(
      ApiResponse.success({
        data: slides,
        message: "Contenido del carrusel",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudieron obtener los slides",
        error,
      })
    );
  }
};

export const listCarouselHandler = async (_req: Request, res: Response) => {
  try {
    const slides = await listCarouselSlides();
    res.json(
      ApiResponse.success({
        data: slides,
        message: "Slides encontrados",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudieron listar los slides",
        error,
      })
    );
  }
};

export const createCarouselHandler = async (req: Request, res: Response) => {
  const parsed = CarouselSlideCreateSchema.safeParse(req.body);
  const errorResponse = mapValidationError(parsed);
  if (errorResponse) {
    res.status(400).json(errorResponse);
    return;
  }

  try {
    const payload = parsed.data;
    const slide = await createCarouselSlide({
      title: payload.title ?? null,
      subtitle: payload.subtitle ?? null,
      imageUrl: payload.imageUrl,
      altText: payload.altText ?? null,
      targetUrl: payload.targetUrl ?? null,
      order: payload.order ?? 0,
      isActive: payload.isActive ?? true,
      startsAt: payload.startsAt ?? null,
      endsAt: payload.endsAt ?? null,
    });

    res
      .status(201)
      .json(ApiResponse.success({ data: slide, message: "Slide creado" }));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo crear el slide",
        error,
      })
    );
  }
};

export const updateCarouselHandler = async (req: Request, res: Response) => {
  const params = IdParamSchema.safeParse(req.params);
  const body = CarouselSlideUpdateSchema.safeParse(req.body);

  const paramsError = mapValidationError(params);
  if (paramsError) {
    res.status(400).json(paramsError);
    return;
  }

  const bodyError = mapValidationError(body);
  if (bodyError) {
    res.status(400).json(bodyError);
    return;
  }

  try {
    const payload = body.data;
    const slide = await updateCarouselSlide(params.data.id, {
      title: normalizeNullable(payload.title),
      subtitle: normalizeNullable(payload.subtitle),
      imageUrl: payload.imageUrl,
      altText: normalizeNullable(payload.altText),
      targetUrl: normalizeNullable(payload.targetUrl),
      order: payload.order,
      isActive: payload.isActive,
      startsAt: normalizeDate(payload.startsAt),
      endsAt: normalizeDate(payload.endsAt),
    });

    res.json(
      ApiResponse.success({ data: slide, message: "Slide actualizado" })
    );
  } catch (error) {
    if (handlePrismaNotFound(error, res, "Slide no encontrado")) return;
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo actualizar el slide",
        error,
      })
    );
  }
};

export const deleteCarouselHandler = async (req: Request, res: Response) => {
  const parsed = IdParamSchema.safeParse(req.params);
  const paramsError = mapValidationError(parsed);
  if (paramsError) {
    res.status(400).json(paramsError);
    return;
  }

  try {
    await deleteCarouselSlide(parsed.data.id);
    res.json(ApiResponse.success({ message: "Slide eliminado" }));
  } catch (error) {
    if (handlePrismaNotFound(error, res, "Slide no encontrado")) return;
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo eliminar el slide",
        error,
      })
    );
  }
};

export const getCompanyProfileHandler = async (_req: Request, res: Response) => {
  try {
    const company = await getCompanyProfile();
    res.json(
      ApiResponse.success({
        data: company ?? null,
        message: company ? "Perfil obtenido" : "Sin informacion",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo obtener la informacion de la empresa",
        error,
      })
    );
  }
};

export const upsertCompanyProfileHandler = async (
  req: Request,
  res: Response
) => {
  const parsed = CompanyProfileUpsertSchema.safeParse(req.body);
  const errorResponse = mapValidationError(parsed);
  if (errorResponse) {
    res.status(400).json(errorResponse);
    return;
  }

  try {
    const payload = parsed.data;
    const company = await upsertCompanyProfile({
      id: payload.id,
      name: payload.name,
      tagline: payload.tagline ?? null,
      about: payload.about ?? null,
      mission: payload.mission ?? null,
      vision: payload.vision ?? null,
      values: payload.values ?? null,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      whatsapp: payload.whatsapp ?? null,
      address: payload.address ?? null,
      mapUrl: payload.mapUrl ?? null,
      logoUrl: payload.logoUrl ?? null,
      faviconUrl: payload.faviconUrl ?? null,
      supportHours: payload.supportHours ?? null,
      socialLinks: payload.socialLinks ?? null,
    });

    res.json(
      ApiResponse.success({
        data: company,
        message: "Perfil actualizado",
      })
    );
  } catch (error) {
    if (handlePrismaNotFound(error, res, "Perfil no encontrado")) return;
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo actualizar la empresa",
        error,
      })
    );
  }
};

export const listLegalDocumentsHandler = async (_req: Request, res: Response) => {
  try {
    const docs = await listLegalDocuments();
    res.json(
      ApiResponse.success({
        data: docs,
        message: "Documentos legales",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudieron listar los documentos",
        error,
      })
    );
  }
};

export const getLegalDocumentHandler = async (req: Request, res: Response) => {
  const parsed = LegalQuerySchema.safeParse({
    type: req.params.type as LegalDocumentType,
  });
  const errorResponse = mapValidationError(parsed);
  if (errorResponse) {
    res.status(400).json(errorResponse);
    return;
  }

  try {
    const doc = await getLegalByType(parsed.data.type);
    if (!doc) {
      res.status(404).json(
        ApiResponse.error({
          message: "Documento no disponible",
        })
      );
      return;
    }
    res.json(
      ApiResponse.success({
        data: doc,
        message: "Documento legal",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo obtener el documento",
        error,
      })
    );
  }
};

export const createLegalDocumentHandler = async (
  req: Request,
  res: Response
) => {
  const parsed = LegalDocumentCreateSchema.safeParse(req.body);
  const errorResponse = mapValidationError(parsed);
  if (errorResponse) {
    res.status(400).json(errorResponse);
    return;
  }

  try {
    const payload = parsed.data;
    const publishedAt =
      payload.publishedAt === undefined
        ? payload.isActive === false
          ? null
          : new Date()
        : payload.publishedAt;
    const doc = await createLegalDocument({
      type: payload.type,
      title: payload.title,
      content: payload.content,
      version: payload.version ?? null,
      isActive: payload.isActive ?? true,
      publishedAt,
    });

    res.status(201).json(
      ApiResponse.success({
        data: doc,
        message: "Documento creado",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo crear el documento",
        error,
      })
    );
  }
};

export const updateLegalDocumentHandler = async (
  req: Request,
  res: Response
) => {
  const params = IdParamSchema.safeParse(req.params);
  const body = LegalDocumentUpdateSchema.safeParse(req.body);

  const paramsError = mapValidationError(params);
  if (paramsError) {
    res.status(400).json(paramsError);
    return;
  }

  const bodyError = mapValidationError(body);
  if (bodyError) {
    res.status(400).json(bodyError);
    return;
  }

  try {
    const payload = body.data;
    const doc = await updateLegalDocument(params.data.id, {
      type: payload.type,
      title: payload.title,
      content: payload.content,
      version: normalizeNullable(payload.version),
      isActive: payload.isActive,
      publishedAt: normalizeDate(payload.publishedAt),
    });

    res.json(
      ApiResponse.success({
        data: doc,
        message: "Documento actualizado",
      })
    );
  } catch (error) {
    if (handlePrismaNotFound(error, res, "Documento no encontrado")) return;
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo actualizar el documento",
        error,
      })
    );
  }
};

export const deleteLegalDocumentHandler = async (
  req: Request,
  res: Response
) => {
  const parsed = IdParamSchema.safeParse(req.params);
  const paramsError = mapValidationError(parsed);
  if (paramsError) {
    res.status(400).json(paramsError);
    return;
  }

  try {
    await deleteLegalDocument(parsed.data.id);
    res.json(ApiResponse.success({ message: "Documento eliminado" }));
  } catch (error) {
    if (handlePrismaNotFound(error, res, "Documento no encontrado")) return;
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo eliminar el documento",
        error,
      })
    );
  }
};
