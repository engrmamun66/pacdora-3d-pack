-- AlterTable
ALTER TABLE "template" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'published';

-- Existing hidden templates become drafts; "published" stays in step with status.
UPDATE "template" SET "status" = 'draft' WHERE "published" = false;
