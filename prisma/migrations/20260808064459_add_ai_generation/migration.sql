-- CreateEnum
CREATE TYPE "GenerationKind" AS ENUM ('DOCUMENT_EXTRACTION', 'LISTING', 'SOCIAL');

-- CreateTable
CREATE TABLE "AiGeneration" (
    "id" TEXT NOT NULL,
    "kind" "GenerationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "preview" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "propertyId" TEXT,
    "createdById" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiGeneration_organizationId_kind_createdAt_idx" ON "AiGeneration"("organizationId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AiGeneration_organizationId_propertyId_createdAt_idx" ON "AiGeneration"("organizationId", "propertyId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiGeneration" ADD CONSTRAINT "AiGeneration_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGeneration" ADD CONSTRAINT "AiGeneration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGeneration" ADD CONSTRAINT "AiGeneration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
