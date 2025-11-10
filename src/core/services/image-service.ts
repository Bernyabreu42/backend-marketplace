import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { randomUUIDv7 } from "bun";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const DELETION_QUEUE_FILE = path.join(UPLOAD_ROOT, ".delete-queue.json");
const LEADING_SLASHES = /^[\\/]+/;
const UPLOADS_PREFIX = /^[\\/]*uploads[\\/]/i;

type DeletionQueueEntry = {
  path: string;
  failCount: number;
  lastError?: string;
  lastTriedAt: string;
};

let deletionQueueCache: DeletionQueueEntry[] | null = null;

export const optimizeAndSaveImage = async (
  buffer: Buffer,
  folder: string
): Promise<string> => {
  const filename = `${randomUUIDv7()}.webp`;
  const targetDir = path.join(UPLOAD_ROOT, folder);

  await fs.mkdir(targetDir, { recursive: true });

  const fullPath = path.join(targetDir, filename);

  await sharp(buffer)
    .resize({ width: 1000 }) // ajustable
    .webp({ quality: 80 })
    .toFile(fullPath);

  return `/uploads/${folder}/${filename}`;
};

const sanitizeRelativePath = (relativePath: string | null | undefined) => {
  if (!relativePath) return "";
  const trimmed = relativePath.trim();
  if (!trimmed) return "";
  const withoutLeading = trimmed.replace(LEADING_SLASHES, "");
  return withoutLeading.replace(UPLOADS_PREFIX, "");
};

const pathFor = (sanitizedPath: string) =>
  path.join(UPLOAD_ROOT, sanitizedPath);

const loadDeletionQueue = async (): Promise<DeletionQueueEntry[]> => {
  if (deletionQueueCache) return deletionQueueCache;
  try {
    const raw = await fs.readFile(DELETION_QUEUE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    deletionQueueCache = Array.isArray(parsed) ? parsed : [];
  } catch {
    deletionQueueCache = [];
  }
  return deletionQueueCache;
};

const saveDeletionQueue = async (entries: DeletionQueueEntry[]) => {
  deletionQueueCache = entries;
  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
  if (entries.length === 0) {
    await fs.rm(DELETION_QUEUE_FILE, { force: true });
    return;
  }
  await fs.writeFile(
    DELETION_QUEUE_FILE,
    JSON.stringify(entries, null, 2),
    "utf-8"
  );
};

const removeFromQueue = async (sanitizedPath: string) => {
  const queue = await loadDeletionQueue();
  if (!queue.length) return;
  const next = queue.filter((entry) => entry.path !== sanitizedPath);
  if (next.length !== queue.length) {
    await saveDeletionQueue(next);
  }
};

const enqueueForRetry = async (sanitizedPath: string, error: unknown) => {
  const queue = await loadDeletionQueue();
  const existingIndex = queue.findIndex(
    (entry) => entry.path === sanitizedPath
  );
  const base = existingIndex >= 0 ? queue[existingIndex] : undefined;
  const entry: DeletionQueueEntry = {
    path: sanitizedPath,
    failCount: (base?.failCount ?? 0) + 1,
    lastError:
      error instanceof Error ? error.message : JSON.stringify(error ?? null),
    lastTriedAt: new Date().toISOString(),
  };
  if (existingIndex >= 0) {
    queue[existingIndex] = entry;
  } else {
    queue.push(entry);
  }
  await saveDeletionQueue(queue);
};

const pruneEmptyDirs = async (start: string) => {
  let current = start;
  while (current.startsWith(UPLOAD_ROOT) && current !== UPLOAD_ROOT) {
    try {
      const entries = await fs.readdir(current);
      if (entries.length > 0) break;
      await fs.rmdir(current);
      current = path.dirname(current);
    } catch {
      break;
    }
  }
};

const attemptDelete = async (sanitizedPath: string) => {
  if (!sanitizedPath) return;
  const fullPath = pathFor(sanitizedPath);
  try {
    await fs.unlink(fullPath);
    await pruneEmptyDirs(path.dirname(fullPath));
    await removeFromQueue(sanitizedPath);
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      await removeFromQueue(sanitizedPath);
      return;
    }
    console.warn(
      "[image-service] No se pudo eliminar la imagen:",
      sanitizedPath,
      error?.message ?? error
    );
    await enqueueForRetry(sanitizedPath, error);
  }
};

export const deleteImage = async (relativePath: string): Promise<void> => {
  const sanitizedPath = sanitizeRelativePath(relativePath);
  if (!sanitizedPath) return;
  await attemptDelete(sanitizedPath);
};

const flushDeletionQueue = async () => {
  const snapshot = [...(await loadDeletionQueue())];
  if (!snapshot.length) return;
  for (const entry of snapshot) {
    await attemptDelete(entry.path);
  }
};

void flushDeletionQueue();
