-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "bonusWhatsappCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "onboardingBonusGrantedAt" TIMESTAMP(3);

