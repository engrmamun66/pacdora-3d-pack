-- AlterTable
ALTER TABLE "template" ADD COLUMN     "geometry" JSONB,
ADD COLUMN     "heightMm" DOUBLE PRECISION,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'builtin',
ADD COLUMN     "widthMm" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "template_category" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TemplateToTemplateCategory" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TemplateToTemplateCategory_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "template_category_kind_sortOrder_idx" ON "template_category"("kind", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "template_category_kind_slug_key" ON "template_category"("kind", "slug");

-- CreateIndex
CREATE INDEX "_TemplateToTemplateCategory_B_index" ON "_TemplateToTemplateCategory"("B");

-- CreateIndex
CREATE INDEX "template_source_published_idx" ON "template"("source", "published");

-- AddForeignKey
ALTER TABLE "_TemplateToTemplateCategory" ADD CONSTRAINT "_TemplateToTemplateCategory_A_fkey" FOREIGN KEY ("A") REFERENCES "template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TemplateToTemplateCategory" ADD CONSTRAINT "_TemplateToTemplateCategory_B_fkey" FOREIGN KEY ("B") REFERENCES "template_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

