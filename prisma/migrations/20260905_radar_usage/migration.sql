-- AlterTable
ALTER TABLE "UsageTracker" ADD COLUMN     "radarCreditsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "radarNotifiedPct" INTEGER NOT NULL DEFAULT 0;

