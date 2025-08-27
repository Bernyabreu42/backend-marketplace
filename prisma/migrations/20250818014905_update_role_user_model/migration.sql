/*
  Warnings:

  - The `role` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "RolesEnum" AS ENUM ('admin', 'seller', 'buyer', 'support');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role",
ADD COLUMN     "role" "RolesEnum" NOT NULL DEFAULT 'buyer';
