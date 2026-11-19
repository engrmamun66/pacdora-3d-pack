-- AlterTable
ALTER TABLE "user" ADD COLUMN "cardColumns" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN "cardImage" TEXT NOT NULL DEFAULT 'dieline';

-- CreateTable
CREATE TABLE "project_capture" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "layoutName" TEXT,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "cover" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_capture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_capture_storageKey_key" ON "project_capture"("storageKey");

-- CreateIndex
CREATE INDEX "project_capture_projectId_createdAt_idx" ON "project_capture"("projectId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "project_capture" ADD CONSTRAINT "project_capture_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_capture" ADD CONSTRAINT "project_capture_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
