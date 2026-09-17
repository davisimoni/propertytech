-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "stripeOverageItemId" TEXT;

-- CreateTable
CREATE TABLE "MeteredUsageEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeteredUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeteredUsageEvent_reportedAt_createdAt_idx" ON "MeteredUsageEvent"("reportedAt", "createdAt");

-- CreateIndex
CREATE INDEX "MeteredUsageEvent_organizationId_createdAt_idx" ON "MeteredUsageEvent"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "MeteredUsageEvent" ADD CONSTRAINT "MeteredUsageEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

