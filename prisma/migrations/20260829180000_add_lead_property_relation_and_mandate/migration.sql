-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('ESCLUSIVA', 'NON_ESCLUSIVA', 'SELEZIONE');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "propertyId" TEXT;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "commissionRate" DECIMAL(5,2),
ADD COLUMN     "keysInOffice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "keysLocation" TEXT,
ADD COLUMN     "listingType" "ListingType",
ADD COLUMN     "mandateExpiration" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Lead_propertyId_idx" ON "Lead"("propertyId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

