-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "listingFeedToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_listingFeedToken_key" ON "Organization"("listingFeedToken");

