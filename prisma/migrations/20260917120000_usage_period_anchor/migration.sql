-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "billingCycleAnchor" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UsageTracker" ADD COLUMN     "periodStart" TIMESTAMP(3);

