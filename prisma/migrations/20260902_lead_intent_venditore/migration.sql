-- CreateEnum
CREATE TYPE "LeadIntent" AS ENUM ('ACQUISTO', 'VENDITA', 'ENTRAMBI');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "intent" "LeadIntent",
ADD COLUMN     "sellerPropertyComune" TEXT,
ADD COLUMN     "sellerPropertyCondition" TEXT,
ADD COLUMN     "sellerPropertySquareMeters" INTEGER,
ADD COLUMN     "sellerPropertyType" "PropertyType",
ADD COLUMN     "sellerPropertyZona" TEXT,
ADD COLUMN     "sellerTimeframe" TEXT,
ADD COLUMN     "sellerValuationInterest" BOOLEAN;

