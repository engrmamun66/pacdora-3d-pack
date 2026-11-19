-- Each project gets a slug, unique among the same Client's projects.
ALTER TABLE "project" ADD COLUMN "slug" TEXT;

-- Existing projects: the name in lower case with dashes. The first one of a name keeps it plain, the others end with
-- the last six letters of their id so no two are alike.
UPDATE "project" p SET "slug" = left(r.base, 50) || CASE WHEN r.rn = 1 THEN '' ELSE '-' || right(p."id", 6) END
FROM (
  SELECT "id",
         COALESCE(NULLIF(trim(both '-' from lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g'))), ''), 'project') AS base,
         row_number() OVER (
           PARTITION BY "userId", COALESCE(NULLIF(trim(both '-' from lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g'))), ''), 'project')
           ORDER BY "createdAt", "id"
         ) AS rn
  FROM "project"
) r
WHERE p."id" = r."id";

ALTER TABLE "project" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "project_userId_slug_key" ON "project"("userId", "slug");
CREATE INDEX "project_userId_templateId_idx" ON "project"("userId", "templateId");
