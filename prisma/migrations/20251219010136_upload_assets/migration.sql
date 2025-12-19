-- CreateEnum
CREATE TYPE "UploadAssetType" AS ENUM ('image', 'video', 'audio', 'document', 'other');

-- CreateTable
CREATE TABLE "UploadAsset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "path" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "type" "UploadAssetType" NOT NULL DEFAULT 'image',
    "size" INTEGER NOT NULL DEFAULT 0,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UploadAsset_path_key" ON "UploadAsset"("path");

-- CreateIndex
CREATE INDEX "UploadAsset_ownerId_folder_idx" ON "UploadAsset"("ownerId", "folder");

-- AddForeignKey
ALTER TABLE "UploadAsset" ADD CONSTRAINT "UploadAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
