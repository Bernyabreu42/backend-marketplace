-- CreateEnum
CREATE TYPE "PromoModalKind" AS ENUM ('promo', 'info', 'cookies', 'alert');

-- AlterTable
ALTER TABLE "PromoModal" ADD COLUMN     "kind" "PromoModalKind" NOT NULL DEFAULT 'promo';
