-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "pendingPlanAt" TIMESTAMP(3),
ADD COLUMN     "pendingPlanId" "PlanId";
