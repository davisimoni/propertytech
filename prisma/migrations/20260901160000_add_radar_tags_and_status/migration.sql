-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('IN_ARRIVO', 'ATTIVA', 'DESERTA', 'AGGIUDICATA');
-- AlterTable
ALTER TABLE "RadarProperty" ADD COLUMN     "auctionStatus" "AuctionStatus",
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
