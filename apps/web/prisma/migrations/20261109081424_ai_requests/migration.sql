-- CreateTable
CREATE TABLE "ai_request" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "inputChars" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_request_userId_createdAt_idx" ON "ai_request"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "ai_request" ADD CONSTRAINT "ai_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
