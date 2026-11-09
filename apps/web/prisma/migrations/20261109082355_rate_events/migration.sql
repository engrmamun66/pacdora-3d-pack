-- CreateTable
CREATE TABLE "rate_event" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_event_userId_kind_createdAt_idx" ON "rate_event"("userId", "kind", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "rate_event" ADD CONSTRAINT "rate_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
