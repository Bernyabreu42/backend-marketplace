import type { Request, Response } from "express";
import { optimizeAndSaveImage } from "../../core/services/image-service";
import { ApiResponse } from "../../core/responses/ApiResponse";

const sanitizeFolder = (s: string) =>
  (s || "general").replace(/[^a-z0-9/_-]/gi, "").slice(0, 60);

export const uploadSingle = async (req: Request, res: Response) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json(ApiResponse.error({ message: "Archivo faltante" }));
      return;
    }
    const folder = sanitizeFolder(String(req.body?.folder ?? "general"));
    const url = await optimizeAndSaveImage(req.file.buffer, folder);
    res.status(201).json(ApiResponse.success({ data: url }));
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

    const urls = await Promise.all(
      files.map((f) => optimizeAndSaveImage(f.buffer, folder))
    );

    res.status(201).json(ApiResponse.success({ data: urls }));
  } catch (err: any) {
    res.status(500).json(
      ApiResponse.error({
        message: "Error subiendo imágenes",
        error: err?.message,
      })
    );
  }
};

