-- CreateEnum
CREATE TYPE "CancellationReason" AS ENUM ('TOO_EXPENSIVE', 'NOT_USED_ENOUGH', 'MISSING_FEATURES', 'CHOSE_ALTERNATIVE', 'OTHER');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "retentionDiscountAppliedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CancellationFeedback" (
    "id" TEXT NOT NULL,
    "reason" "CancellationReason" NOT NULL,
    "details" TEXT,
    "planAtCancellation" "PlanId" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "CancellationFeedback_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CancellationFeedback" ADD CONSTRAINT "CancellationFeedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
