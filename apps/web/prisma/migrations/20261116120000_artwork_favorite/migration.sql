-- CreateTable
CREATE TABLE "artwork_favorite" (
    "userId" TEXT NOT NULL,
    "artworkId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artwork_favorite_pkey" PRIMARY KEY ("userId","artworkId")
);

-- CreateIndex
CREATE INDEX "artwork_favorite_artworkId_idx" ON "artwork_favorite"("artworkId");

-- AddForeignKey
ALTER TABLE "artwork_favorite" ADD CONSTRAINT "artwork_favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artwork_favorite" ADD CONSTRAINT "artwork_favorite_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "artwork_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
