-- AlterTable
ALTER TABLE "RadarProperty" ADD COLUMN     "marketValueEur" INTEGER,
ADD COLUMN     "monthlyRentEur" INTEGER,
ADD COLUMN     "priceDropAt" TIMESTAMP(3),
ADD COLUMN     "priceDropNewMatches" INTEGER,
ADD COLUMN     "priceDropPct" INTEGER,
ADD COLUMN     "priceDropSeenAt" TIMESTAMP(3),
ADD COLUMN     "renovationCostEur" INTEGER,
ADD COLUMN     "transferCostsEur" INTEGER;
-- CreateTable
CREATE TABLE "RadarZoneDemand" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "zoneKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RadarZoneDemand_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "RadarZoneDemand_organizationId_idx" ON "RadarZoneDemand"("organizationId");
-- CreateIndex
CREATE UNIQUE INDEX "RadarZoneDemand_organizationId_zoneKey_key" ON "RadarZoneDemand"("organizationId", "zoneKey");
-- AddForeignKey
ALTER TABLE "RadarZoneDemand" ADD CONSTRAINT "RadarZoneDemand_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
