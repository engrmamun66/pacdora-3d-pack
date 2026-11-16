-- CreateTable
CREATE TABLE "artwork_item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tags" TEXT[],
    "category" TEXT NOT NULL DEFAULT '',
    "storageKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "widthPx" INTEGER NOT NULL,
    "heightPx" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artwork_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "artwork_item_storageKey_key" ON "artwork_item"("storageKey");

-- CreateIndex
CREATE INDEX "artwork_item_category_idx" ON "artwork_item"("category");

-- CreateIndex
CREATE INDEX "artwork_item_createdAt_idx" ON "artwork_item"("createdAt" DESC);
