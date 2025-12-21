-- Add hierarchy and menu metadata to categories
ALTER TABLE "Category"
ADD COLUMN "description" TEXT,
ADD COLUMN "parentId" TEXT,
ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Category"
ADD CONSTRAINT "Category_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Category_parentId_order_idx" ON "Category"("parentId", "order");
