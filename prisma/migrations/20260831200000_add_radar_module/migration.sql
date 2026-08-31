-- CreateEnum
CREATE TYPE "RadarSource" AS ENUM ('MANUALE', 'PVP', 'ASTALEGALE', 'PORTALE');
-- CreateEnum
CREATE TYPE "RadarKind" AS ENUM ('ASTA', 'RIBASSO');
-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('VERDE', 'GIALLO', 'ROSSO');
-- CreateEnum
CREATE TYPE "OccupancyStatus" AS ENUM ('LIBERO', 'OCCUPATO_CON_TITOLO', 'OCCUPATO_SENZA_TITOLO', 'NON_DETERMINATO');
-- CreateEnum
CREATE TYPE "AppraisalStatus" AS ENUM ('IN_ANALISI', 'PRONTA', 'FALLITA');
-- CreateTable
CREATE TABLE "RadarProperty" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "RadarKind" NOT NULL,
    "source" "RadarSource" NOT NULL DEFAULT 'MANUALE',
    "sourceRef" TEXT,
    "sourceUrl" TEXT,
    "comune" TEXT NOT NULL,
    "zona" TEXT,
    "type" "PropertyType" NOT NULL,
    "priceEur" INTEGER NOT NULL,
    "squareMeters" INTEGER NOT NULL,
    "basePriceEur" INTEGER,
    "previousPriceEur" INTEGER,
    "auctionDate" TIMESTAMP(3),
    "lotto" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RadarProperty_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AuctionAppraisal" (
    "id" TEXT NOT NULL,
    "radarPropertyId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "AppraisalStatus" NOT NULL DEFAULT 'IN_ANALISI',
    "failureReason" TEXT,
    "occupancy" "OccupancyStatus" NOT NULL DEFAULT 'NON_DETERMINATO',
    "risk" "RiskLevel" NOT NULL DEFAULT 'GIALLO',
    "riskReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "irregularities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "encumbrances" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "remediationCostMinEur" INTEGER,
    "remediationCostMaxEur" INTEGER,
    "summary" TEXT,
    "pagesAnalysed" INTEGER,
    "pageRange" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuctionAppraisal_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AuctionLeadMatch" (
    "id" TEXT NOT NULL,
    "radarPropertyId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seenAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuctionLeadMatch_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "RadarProperty_organizationId_kind_auctionDate_idx" ON "RadarProperty"("organizationId", "kind", "auctionDate");
-- CreateIndex
CREATE INDEX "RadarProperty_organizationId_archivedAt_idx" ON "RadarProperty"("organizationId", "archivedAt");
-- CreateIndex
CREATE UNIQUE INDEX "RadarProperty_organizationId_source_sourceRef_key" ON "RadarProperty"("organizationId", "source", "sourceRef");
-- CreateIndex
CREATE UNIQUE INDEX "AuctionAppraisal_radarPropertyId_key" ON "AuctionAppraisal"("radarPropertyId");
-- CreateIndex
CREATE INDEX "AuctionAppraisal_organizationId_status_idx" ON "AuctionAppraisal"("organizationId", "status");
-- CreateIndex
CREATE INDEX "AuctionLeadMatch_organizationId_score_idx" ON "AuctionLeadMatch"("organizationId", "score");
-- CreateIndex
CREATE UNIQUE INDEX "AuctionLeadMatch_radarPropertyId_leadId_key" ON "AuctionLeadMatch"("radarPropertyId", "leadId");
-- AddForeignKey
ALTER TABLE "RadarProperty" ADD CONSTRAINT "RadarProperty_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AuctionAppraisal" ADD CONSTRAINT "AuctionAppraisal_radarPropertyId_fkey" FOREIGN KEY ("radarPropertyId") REFERENCES "RadarProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AuctionAppraisal" ADD CONSTRAINT "AuctionAppraisal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AuctionLeadMatch" ADD CONSTRAINT "AuctionLeadMatch_radarPropertyId_fkey" FOREIGN KEY ("radarPropertyId") REFERENCES "RadarProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AuctionLeadMatch" ADD CONSTRAINT "AuctionLeadMatch_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AuctionLeadMatch" ADD CONSTRAINT "AuctionLeadMatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
