-- AlterTable
ALTER TABLE "WhatsAppConfig" ADD COLUMN     "qrConnectedAt" TIMESTAMP(3),
ADD COLUMN     "qrSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConfig_qrSessionId_key" ON "WhatsAppConfig"("qrSessionId");

