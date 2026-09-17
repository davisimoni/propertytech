-- AlterTable
ALTER TABLE "User" ADD COLUMN     "newsletterOptOutAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "NewsletterCampaign" (
    "id" TEXT NOT NULL,
    "sendDate" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "issueKey" TEXT NOT NULL,
    "pillar" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "NewsletterCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterDelivery" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'pending',
    "upsell" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsletterDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterCampaign_sendDate_key" ON "NewsletterCampaign"("sendDate");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterCampaign_sequence_key" ON "NewsletterCampaign"("sequence");

-- CreateIndex
CREATE INDEX "NewsletterDelivery_userId_idx" ON "NewsletterDelivery"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterDelivery_campaignId_userId_key" ON "NewsletterDelivery"("campaignId", "userId");

-- AddForeignKey
ALTER TABLE "NewsletterDelivery" ADD CONSTRAINT "NewsletterDelivery_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "NewsletterCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterDelivery" ADD CONSTRAINT "NewsletterDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

