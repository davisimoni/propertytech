-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('NEW', 'QUALIFIED', 'VISIT_SCHEDULED', 'OFFER_SENT', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('VENDITA', 'AFFITTO');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('APPARTAMENTO', 'ATTICO', 'VILLA', 'VILLETTA', 'LOFT', 'RUSTICO', 'TERRENO', 'NEGOZIO', 'UFFICIO', 'BOX', 'ALTRO');

-- CreateEnum
CREATE TYPE "EnergyClass" AS ENUM ('A4', 'A3', 'A2', 'A1', 'A', 'B', 'C', 'D', 'E', 'F', 'G');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "budgetMax" INTEGER,
ADD COLUMN     "budgetMin" INTEGER,
ADD COLUMN     "dealStage" "DealStage" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "minSquareMeters" INTEGER,
ADD COLUMN     "preferredType" "PropertyType",
ADD COLUMN     "preferredZone" TEXT;

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contract" "ContractType" NOT NULL,
    "type" "PropertyType" NOT NULL,
    "comune" TEXT NOT NULL,
    "provincia" TEXT,
    "zona" TEXT,
    "indirizzo" TEXT,
    "priceEur" INTEGER NOT NULL,
    "squareMeters" INTEGER NOT NULL,
    "rooms" INTEGER,
    "bathrooms" INTEGER,
    "floor" TEXT,
    "energyClass" "EnergyClass",
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyLeadMatch" (
    "id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "propertyId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "PropertyLeadMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Property_organizationId_createdAt_idx" ON "Property"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Property_organizationId_reference_key" ON "Property"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "PropertyLeadMatch_organizationId_score_idx" ON "PropertyLeadMatch"("organizationId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyLeadMatch_propertyId_leadId_key" ON "PropertyLeadMatch"("propertyId", "leadId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_dealStage_idx" ON "Lead"("organizationId", "dealStage");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyLeadMatch" ADD CONSTRAINT "PropertyLeadMatch_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyLeadMatch" ADD CONSTRAINT "PropertyLeadMatch_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyLeadMatch" ADD CONSTRAINT "PropertyLeadMatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

