ALTER TABLE "Order" RENAME COLUMN "discountAmount" TO "totalDiscountAmount";
ALTER TABLE "Order" ALTER COLUMN "totalDiscountAmount" SET DEFAULT 0;
ALTER TABLE "Order" DROP COLUMN "promotionAmount";
