-- CreateTable
CREATE TABLE "PropertyAudit" (
    "id" TEXT NOT NULL,
    "states" JSONB NOT NULL,
    "notes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "propertyId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "PropertyAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyAudit_propertyId_key" ON "PropertyAudit"("propertyId");

-- CreateIndex
CREATE INDEX "PropertyAudit_organizationId_idx" ON "PropertyAudit"("organizationId");

-- AddForeignKey
ALTER TABLE "PropertyAudit" ADD CONSTRAINT "PropertyAudit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyAudit" ADD CONSTRAINT "PropertyAudit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
