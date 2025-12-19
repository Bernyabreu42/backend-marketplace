import fs from "fs/promises";
import path from "path";
import { lookup as lookupMime } from "mime-types";
import type { UploadAsset as UploadAssetModel } from "@prisma/client";
import { RolesEnum } from "../../core/enums";
import prisma from "../../database/prisma";
import { deleteImage } from "../../core/services/image-service";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const INVALID_FOLDER_CHARS = /[^a-z0-9/_.-]/gi;
const SLASHES = /^[\\/]+|[\\/]+$/g;
const PRIVILEGED_ROLES = new Set<RolesEnum>([RolesEnum.ADMIN, RolesEnum.SUPPORT]);

export type UploadAssetType =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "other";

export interface UploadAsset {
  id: string;
  path: string;
  folder: string;
  filename: string;
  url: string;
  extension: string;
  mimeType: string | null;
  type: UploadAssetType;
  size: number;
  createdAt: string;
  updatedAt: string;
  ownerId?: string | null;
  isGlobal?: boolean;
}

export interface UploadAssetFilters {
  folder?: string;
  search?: string;
  type?: UploadAssetType | "all";
  ownerId?: string | null;
  role?: RolesEnum;
  page?: number;
  pageSize?: number;
}

export interface RecordedAssetInput {
  path: string;
  folder: string;
  filename: string;
  ownerId?: string | null;
  size: number;
  mimeType?: string | null;
  type: UploadAssetType;
  isGlobal?: boolean;
}

export class UploadAssetError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const sanitizeFolder = (value?: string | null) => {
  if (!value) return "";
  return value.replace(INVALID_FOLDER_CHARS, "").replace(SLASHES, "");
};

const sanitizeRelativePath = (value?: string | null) => {
  if (!value) return "";
  return value
    .replace(INVALID_FOLDER_CHARS, "")
    .replace(SLASHES, "")
    .replace(/\.\.+/g, "")
    .replace(/\/{2,}/g, "/");
};

const isPrivileged = (role?: RolesEnum) =>
  Boolean(role && PRIVILEGED_ROLES.has(role));

const inferAssetType = (mimeType: string | null): UploadAssetType => {
  if (!mimeType) return "other";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (
    mimeType === "application/pdf" ||
    mimeType === "text/plain" ||
    mimeType.startsWith("application/msword") ||
    mimeType.startsWith("application/vnd") ||
    mimeType.startsWith("application/text")
  ) {
    return "document";
  }
  return "other";
};

const mapAsset = (asset: UploadAssetModel): UploadAsset => {
  const extension = path.extname(asset.filename).replace(".", "").toLowerCase();
  return {
    id: asset.id,
    path: asset.path,
    folder: asset.folder,
    filename: asset.filename,
    url: asset.url,
    extension,
    mimeType: asset.mimeType,
    type: asset.type as UploadAssetType,
    size: asset.size,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    ownerId: asset.ownerId,
    isGlobal: asset.isGlobal,
  };
};

const canManageAsset = (
  asset: UploadAssetModel,
  ownerId?: string | null,
  role?: RolesEnum
) => {
  if (isPrivileged(role)) return true;
  return !!ownerId && asset.ownerId === ownerId;
};

export const recordUploadAsset = async ({
  path: relativePath,
  folder,
  filename,
  ownerId,
  size,
  mimeType,
  type,
  isGlobal = false,
}: RecordedAssetInput) => {
  const sanitizedPath = sanitizeRelativePath(relativePath);
  if (!sanitizedPath) return null;
  const normalizedFolder = sanitizeFolder(folder);

  const asset = await prisma.uploadAsset.upsert({
    where: { path: sanitizedPath },
    update: {
      folder: normalizedFolder,
      filename,
      ownerId,
      size,
      mimeType,
      type,
      isGlobal,
      url: `/uploads/${sanitizedPath}`,
    },
    create: {
      path: sanitizedPath,
      folder: normalizedFolder,
      filename,
      ownerId,
      size,
      mimeType,
      type,
      isGlobal,
      url: `/uploads/${sanitizedPath}`,
    },
  });

  return mapAsset(asset);
};

let legacySyncResolved = false;

const ensureLegacyAssetsSynced = async () => {
  if (legacySyncResolved) return;
  const count = await prisma.uploadAsset.count();
  if (count > 0) {
    legacySyncResolved = true;
    return;
  }

  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
  const folders = await fs.readdir(UPLOAD_ROOT, { withFileTypes: true });
  for (const folderEntry of folders) {
    if (!folderEntry.isDirectory() || folderEntry.name.startsWith(".")) continue;
    const folderName = folderEntry.name;
    const folderPath = path.join(UPLOAD_ROOT, folderName);
    let files: fs.Dirent[] = [];
    try {
      files = await fs.readdir(folderPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const fileEntry of files) {
      if (!fileEntry.isFile()) continue;
      const relativePath = `${folderName}/${fileEntry.name}`;
      const fullPath = path.join(folderPath, fileEntry.name);
      try {
        const stats = await fs.stat(fullPath);
        const mimeType = lookupMime(fileEntry.name) || "application/octet-stream";
        const type = inferAssetType(mimeType);
        await recordUploadAsset({
          path: relativePath,
          folder: folderName,
          filename: fileEntry.name,
          size: stats.size,
          ownerId: null,
          mimeType,
          type,
          isGlobal: true,
        });
      } catch {
        // ignore legacy file errors
      }
    }
  }

  legacySyncResolved = true;
};

export const listUploadAssets = async ({
  folder,
  search,
  type,
  ownerId,
  role,
  page = 1,
  pageSize = 24,
}: UploadAssetFilters) => {
  if (isPrivileged(role)) {
    await ensureLegacyAssetsSynced();
  }

  const where: Parameters<typeof prisma.uploadAsset.findMany>[0]["where"] = {};

  if (!isPrivileged(role)) {
    if (!ownerId) {
      return { folders: [], assets: [], total: 0, page, pageSize };
    }
    where.ownerId = ownerId;
  }

  if (folder) {
    where.folder = sanitizeFolder(folder);
  }

  if (search) {
    where.filename = { contains: search.trim(), mode: "insensitive" };
  }

  if (type && type !== "all") {
    where.type = type;
  }

  const skip = (page - 1) * pageSize;

  const [items, total, folderRows] = await Promise.all([
    prisma.uploadAsset.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.uploadAsset.count({ where }),
    prisma.uploadAsset.findMany({
      where: isPrivileged(role)
        ? {}
        : ownerId
        ? { ownerId }
        : { ownerId: "___none___" },
      select: { folder: true },
      distinct: ["folder"],
      orderBy: { folder: "asc" },
    }),
  ]);

  return {
    folders: folderRows.map((row) => row.folder).filter(Boolean),
    assets: items.map(mapAsset),
    total,
    page,
    pageSize,
  };
};

export const deleteUploadAsset = async (
  relativePath: string,
  ownerId?: string | null,
  role?: RolesEnum
) => {
  const sanitized = sanitizeRelativePath(relativePath);
  if (!sanitized) {
    throw new UploadAssetError("Ruta invalida", 400);
  }

  const asset = await prisma.uploadAsset.findFirst({
    where: { path: sanitized },
  });

  if (!asset) {
    throw new UploadAssetError("Archivo no encontrado", 404);
  }

  if (!canManageAsset(asset, ownerId, role)) {
    throw new UploadAssetError("No autorizado", 403);
  }

  await prisma.uploadAsset.delete({ where: { id: asset.id } });
  await deleteImage(sanitized);
};

export const renameUploadAsset = async (
  fromPath: string,
  toPath: string,
  ownerId?: string | null,
  role?: RolesEnum
) => {
  const source = sanitizeRelativePath(fromPath);
  const target = sanitizeRelativePath(toPath);

  if (!source || !target) {
    throw new UploadAssetError("Ruta invalida", 400);
  }

  if (source === target) {
    const existing = await prisma.uploadAsset.findFirst({ where: { path: source } });
    if (!existing) {
      throw new UploadAssetError("Archivo no encontrado", 404);
    }
    return mapAsset(existing);
  }

  const asset = await prisma.uploadAsset.findFirst({
    where: { path: source },
  });

  if (!asset) {
    throw new UploadAssetError("Archivo no encontrado", 404);
  }

  if (!canManageAsset(asset, ownerId, role)) {
    throw new UploadAssetError("No autorizado", 403);
  }

  const targetExists = await prisma.uploadAsset.findFirst({
    where: { path: target },
  });

  if (targetExists) {
    throw new UploadAssetError("Ya existe un archivo con ese nombre", 409);
  }

  const sourceFull = path.join(UPLOAD_ROOT, source);
  const targetFull = path.join(UPLOAD_ROOT, target);

  await fs.mkdir(path.dirname(targetFull), { recursive: true });
  await fs.rename(sourceFull, targetFull);

  const folderName = sanitizeFolder(path.dirname(target));
  const filename = path.basename(target);

  const updated = await prisma.uploadAsset.update({
    where: { id: asset.id },
    data: {
      path: target,
      folder: folderName,
      filename,
      url: `/uploads/${target}`,
    },
  });

  return mapAsset(updated);
};
