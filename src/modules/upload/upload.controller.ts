import type { Request, Response } from "express";
import { RolesEnum } from "../../core/enums";
import { optimizeAndSaveImage } from "../../core/services/image-service";
import { ApiResponse } from "../../core/responses/ApiResponse";
import {
  deleteUploadAsset,
  listUploadAssets,
  recordUploadAsset,
  renameUploadAsset,
  type UploadAssetType,
  UploadAssetError,
} from "./upload.service";

const sanitizeFolder = (s: string) =>
  (s || "general").replace(/[^a-z0-9/_.-]/gi, "").slice(0, 60);

const parseIntParam = (
  value: unknown,
  fallback: number,
  { min = 1, max = 200 }: { min?: number; max?: number } = {}
) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const parseAssetType = (
  type?: string | null
): UploadAssetType | "all" | undefined => {
  if (!type) return undefined;
  const normalized = type.toLowerCase();
  if (normalized === "all") return "all";
  if (["image", "video", "audio", "document", "other"].includes(normalized)) {
    return normalized as UploadAssetType;
  }
  return undefined;
};

export const uploadSingle = async (req: Request, res: Response) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json(ApiResponse.error({ message: "Archivo faltante" }));
      return;
    }
    const folder = sanitizeFolder(String(req.body?.folder ?? "general"));
    const result = await optimizeAndSaveImage(req.file.buffer, folder);

    await recordUploadAsset({
      path: result.path,
      folder: result.folder,
      filename: result.filename,
      ownerId: req.user?.id ?? null,
      size: result.size,
      mimeType: result.mimeType,
      type: "image",
    });

    res.status(201).json(ApiResponse.success({ data: result.url }));
  } catch (err: any) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error subiendo imagen",
        error: err?.message,
      })
    );
  }
};

export const uploadMultiple = async (req: Request, res: Response) => {
  try {
    const files = Array.isArray(req.files)
      ? (req.files as Express.Multer.File[])
      : [];

    if (!files.length) {
      res
        .status(400)
        .json(ApiResponse.error({ message: "Archivos faltantes" }));
      return;
    }

    const folder = sanitizeFolder(String(req.body?.folder ?? "general"));

    const uploads = await Promise.all(
      files.map((file) => optimizeAndSaveImage(file.buffer, folder))
    );

    await Promise.all(
      uploads.map((upload) =>
        recordUploadAsset({
          path: upload.path,
          folder: upload.folder,
          filename: upload.filename,
          ownerId: req.user?.id ?? null,
          size: upload.size,
          mimeType: upload.mimeType,
          type: "image",
        })
      )
    );

    res
      .status(201)
      .json(ApiResponse.success({ data: uploads.map((upload) => upload.url) }));
  } catch (err: any) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error subiendo imágenes",
        error: err?.message,
      })
    );
  }
};

export const listUploadResources = async (req: Request, res: Response) => {
  try {
    const folder =
      typeof req.query.folder === "string" ? req.query.folder : undefined;
    const search =
      typeof req.query.search === "string" ? req.query.search : undefined;
    const type = parseAssetType(
      typeof req.query.type === "string" ? req.query.type : undefined
    );
    const page = parseIntParam(req.query.page, 1, { min: 1, max: 500 });
    const pageSize = parseIntParam(req.query.pageSize ?? req.query.limit, 24, {
      min: 1,
      max: 200,
    });

    const result = await listUploadAssets({
      folder,
      search,
      type,
      ownerId: req.user?.id ?? null,
      role: (req.user?.role as RolesEnum) ?? undefined,
      page,
      pageSize,
    });

    res.json(
      ApiResponse.success({
        data: {
          items: result.assets,
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          folders: result.folders,
        },
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo listar el contenido",
        error,
      })
    );
  }
};

export const deleteUploadResource = async (req: Request, res: Response) => {
  try {
    const rawPath =
      (typeof req.body?.path === "string" && req.body.path) ||
      (typeof req.query?.path === "string" && req.query.path) ||
      "";

    if (!rawPath) {
      res
        .status(400)
        .json(
          ApiResponse.error({ message: "El parametro path es obligatorio" })
        );
      return;
    }

    await deleteUploadAsset(
      rawPath,
      req.user?.id ?? null,
      (req.user?.role as RolesEnum) ?? undefined
    );

    res.json(ApiResponse.success({ message: "Archivo eliminado" }));
  } catch (error) {
    if (error instanceof UploadAssetError) {
      res
        .status(error.statusCode)
        .json(ApiResponse.error({ message: error.message }));
      return;
    }
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo eliminar el recurso",
        error,
      })
    );
  }
};

export const renameUploadResource = async (req: Request, res: Response) => {
  try {
    const from =
      typeof req.body?.from === "string" ? req.body.from : req.query.from;
    const to =
      typeof req.body?.to === "string" ? req.body.to : req.query.to;

    if (typeof from !== "string" || typeof to !== "string") {
      res
        .status(400)
        .json(
          ApiResponse.error({ message: "Los parametros from y to son obligatorios" })
        );
      return;
    }

    const renamed = await renameUploadAsset(
      from,
      to,
      req.user?.id ?? null,
      (req.user?.role as RolesEnum) ?? undefined
    );

    res.json(
      ApiResponse.success({
        message: "Archivo renombrado",
        data: renamed,
      })
    );
  } catch (error) {
    if (error instanceof UploadAssetError) {
      res
        .status(error.statusCode)
        .json(ApiResponse.error({ message: error.message }));
      return;
    }
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo renombrar el archivo",
        error,
      })
    );
  }
};
