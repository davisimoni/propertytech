-- CreateTable
CREATE TABLE "WhatsAppMutedContact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientPhone" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'comando_agente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppMutedContact_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "WhatsAppMutedContact_organizationId_idx" ON "WhatsAppMutedContact"("organizationId");
-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMutedContact_organizationId_clientPhone_key" ON "WhatsAppMutedContact"("organizationId", "clientPhone");
-- AddForeignKey
ALTER TABLE "WhatsAppMutedContact" ADD CONSTRAINT "WhatsAppMutedContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
