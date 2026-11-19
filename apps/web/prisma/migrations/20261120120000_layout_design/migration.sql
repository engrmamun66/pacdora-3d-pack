-- Custom designs the super admin can dress the layout icons' sample box in.
CREATE TABLE "layout_design" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "fit" TEXT NOT NULL DEFAULT 'cover',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "layout_design_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "layout_design_storageKey_key" ON "layout_design"("storageKey");
CREATE INDEX "layout_design_sortOrder_idx" ON "layout_design"("sortOrder");
