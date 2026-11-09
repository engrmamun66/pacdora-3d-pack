-- CreateTable
CREATE TABLE "site_setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "site_setting_pkey" PRIMARY KEY ("key")
);
