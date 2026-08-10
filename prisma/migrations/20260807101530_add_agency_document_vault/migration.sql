-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('IDENTITA', 'CODICE_FISCALE', 'VISURA_CATASTALE', 'PLANIMETRIA', 'ATTO_PROVENIENZA', 'APE', 'MANDATO', 'PROPOSTA', 'COMPROMESSO', 'CONFORMITA_IMPIANTI', 'ALTRO');

-- CreateTable
CREATE TABLE "AgencyDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "notes" TEXT,
    "fileDataUrl" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT,
    "propertyId" TEXT,
    "uploadedById" TEXT,

    CONSTRAINT "AgencyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgencyDocument_organizationId_expiresAt_idx" ON "AgencyDocument"("organizationId", "expiresAt");

-- CreateIndex
CREATE INDEX "AgencyDocument_organizationId_propertyId_idx" ON "AgencyDocument"("organizationId", "propertyId");

-- CreateIndex
CREATE INDEX "AgencyDocument_organizationId_leadId_idx" ON "AgencyDocument"("organizationId", "leadId");

-- AddForeignKey
ALTER TABLE "AgencyDocument" ADD CONSTRAINT "AgencyDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyDocument" ADD CONSTRAINT "AgencyDocument_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyDocument" ADD CONSTRAINT "AgencyDocument_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyDocument" ADD CONSTRAINT "AgencyDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
