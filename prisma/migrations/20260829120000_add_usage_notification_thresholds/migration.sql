-- AlterTable
ALTER TABLE "UsageTracker" ADD COLUMN     "docNotifiedPct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "voiceNotifiedPct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "whatsappNotifiedPct" INTEGER NOT NULL DEFAULT 0;

