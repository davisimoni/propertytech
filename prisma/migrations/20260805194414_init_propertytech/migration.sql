-- CreateEnum
CREATE TYPE "PlanId" AS ENUM ('trial', 'starter', 'pro', 'enterprise');

-- CreateEnum
CREATE TYPE "QualificationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'QUALIFIED', 'UNQUALIFIED', 'OPT_OUT');

-- CreateEnum
CREATE TYPE "PortalSource" AS ENUM ('IMMOBILIARE_IT', 'IDEALISTA', 'CASA_IT', 'SITO_WEB');

-- CreateEnum
CREATE TYPE "SellerCategory" AS ENUM ('BUYER_ONLY', 'SINGLE_SELLER', 'MULTI_OWNER');

-- CreateEnum
CREATE TYPE "PortfolioMatchStatus" AS ENUM ('PENDING', 'CONFIRMED', 'IGNORED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "agencyName" TEXT NOT NULL,
    "agencyNameConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "legalName" TEXT,
    "logoDataUrl" TEXT,
    "dpaAcceptedAt" TIMESTAMP(3),
    "dpaAcceptedVersion" TEXT,
    "crmWebhookUrl" TEXT,
    "crmWebhookSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "status" "PlanId" NOT NULL DEFAULT 'trial',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageTracker" (
    "id" TEXT NOT NULL,
    "whatsappCreditsUsed" INTEGER NOT NULL DEFAULT 0,
    "docCreditsUsed" INTEGER NOT NULL DEFAULT 0,
    "voiceCreditsUsed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "UsageTracker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppConfig" (
    "id" TEXT NOT NULL,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "phoneNumber" TEXT,
    "metaAccessToken" TEXT,
    "metaPhoneAccountId" TEXT,
    "webhookVerifyToken" TEXT,
    "inboundToken" TEXT NOT NULL,
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderHoursBefore" INTEGER NOT NULL DEFAULT 24,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "WhatsAppConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientPhone" TEXT NOT NULL,
    "portalSource" "PortalSource" NOT NULL,
    "propertyRef" TEXT NOT NULL,
    "qualificationStatus" "QualificationStatus" NOT NULL DEFAULT 'PENDING',
    "budget" TEXT,
    "mortgageApproved" BOOLEAN,
    "mustSellFirst" BOOLEAN,
    "timeframe" TEXT,
    "appointmentSlot" TIMESTAMP(3),
    "ownedPropertiesCount" INTEGER,
    "sellerCategory" "SellerCategory",
    "reminderSentAt" TIMESTAMP(3),
    "appointmentConfirmed" BOOLEAN,
    "crmDeliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "calendarSlotId" TEXT,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioMatch" (
    "id" TEXT NOT NULL,
    "propertyKey" TEXT NOT NULL,
    "comune" TEXT,
    "foglio" TEXT,
    "particella" TEXT,
    "subalterno" TEXT,
    "categoriaCatastale" TEXT,
    "ownerName" TEXT NOT NULL,
    "quotaProprieta" TEXT,
    "status" "PortfolioMatchStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leadId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "PortfolioMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppChat" (
    "id" TEXT NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "leadId" TEXT NOT NULL,

    CONSTRAINT "WhatsAppChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSlot" (
    "id" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "isBooked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "CalendarSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceReport" (
    "id" TEXT NOT NULL,
    "propertyRef" TEXT NOT NULL,
    "sellerName" TEXT,
    "sellerPhone" TEXT,
    "transcript" TEXT NOT NULL,
    "report" JSONB NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sentToSeller" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "VoiceReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_email_key" ON "Organization"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organizationId_key" ON "Subscription"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageTracker_organizationId_key" ON "UsageTracker"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConfig_inboundToken_key" ON "WhatsAppConfig"("inboundToken");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConfig_organizationId_key" ON "WhatsAppConfig"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_calendarSlotId_key" ON "Lead"("calendarSlotId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_qualificationStatus_idx" ON "Lead"("organizationId", "qualificationStatus");

-- CreateIndex
CREATE INDEX "Lead_organizationId_ownedPropertiesCount_idx" ON "Lead"("organizationId", "ownedPropertiesCount");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_organizationId_clientPhone_key" ON "Lead"("organizationId", "clientPhone");

-- CreateIndex
CREATE INDEX "PortfolioMatch_organizationId_status_idx" ON "PortfolioMatch"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioMatch_leadId_propertyKey_key" ON "PortfolioMatch"("leadId", "propertyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppChat_leadId_key" ON "WhatsAppChat"("leadId");

-- CreateIndex
CREATE INDEX "CalendarSlot_organizationId_isBooked_startTime_idx" ON "CalendarSlot"("organizationId", "isBooked", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_createdAt_idx" ON "NewsletterSubscriber"("createdAt");

-- CreateIndex
CREATE INDEX "VoiceReport_organizationId_createdAt_idx" ON "VoiceReport"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageTracker" ADD CONSTRAINT "UsageTracker_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConfig" ADD CONSTRAINT "WhatsAppConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_calendarSlotId_fkey" FOREIGN KEY ("calendarSlotId") REFERENCES "CalendarSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioMatch" ADD CONSTRAINT "PortfolioMatch_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioMatch" ADD CONSTRAINT "PortfolioMatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppChat" ADD CONSTRAINT "WhatsAppChat_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSlot" ADD CONSTRAINT "CalendarSlot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceReport" ADD CONSTRAINT "VoiceReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
