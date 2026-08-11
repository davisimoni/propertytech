-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "crmListingImportUrl" TEXT,
ADD COLUMN     "crmListingImportedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WhatsAppConfig" ADD COLUMN     "genericAuthToken" TEXT,
ADD COLUMN     "genericSendUrl" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'meta',
ADD COLUMN     "twilioAccountSid" TEXT,
ADD COLUMN     "twilioAuthToken" TEXT,
ADD COLUMN     "twilioWhatsAppNumber" TEXT;
