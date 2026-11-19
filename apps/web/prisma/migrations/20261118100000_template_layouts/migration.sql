-- AlterTable
ALTER TABLE "artwork_item" ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "template_layout" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "spec" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_layout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "template_layout_sortOrder_idx" ON "template_layout"("sortOrder");

-- CreateIndex
CREATE INDEX "artwork_item_featured_idx" ON "artwork_item"("featured");
