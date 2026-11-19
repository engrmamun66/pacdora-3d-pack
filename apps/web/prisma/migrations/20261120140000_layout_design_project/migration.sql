-- A layout design is now a project made in the online design editor (not an uploaded picture).
DROP TABLE "layout_design";

CREATE TABLE "layout_design" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "layout_design_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "layout_design_projectId_key" ON "layout_design"("projectId");
CREATE INDEX "layout_design_sortOrder_idx" ON "layout_design"("sortOrder");

ALTER TABLE "layout_design" ADD CONSTRAINT "layout_design_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
