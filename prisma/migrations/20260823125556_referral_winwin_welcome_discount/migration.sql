-- AlterTable
ALTER TABLE "Referral" ADD COLUMN     "refereeWelcomeDiscountAppliedAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'PENDING';

