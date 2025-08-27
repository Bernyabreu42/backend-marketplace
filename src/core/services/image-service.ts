import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { randomUUIDv7 } from "bun";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

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

// ✅ Nueva función de eliminación
export const deleteImage = async (relativePath: string): Promise<void> => {
  if (!relativePath) return;

  // Elimina el prefijo '/uploads' porque ya lo sabemos
  const sanitizedPath = relativePath.replace(/^\/uploads/, "");

  const fullPath = path.join(UPLOAD_ROOT, sanitizedPath);
  try {
    await fs.unlink(fullPath);
    // console.log(`Imagen eliminada: ${fullPath}`);
  } catch (error) {
    console.warn("No se pudo eliminar la imagen:", fullPath);
  }
};
