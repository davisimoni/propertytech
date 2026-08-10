-- AlterEnum
ALTER TYPE "PortalSource" ADD VALUE 'IMPORT';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "clientEmail" TEXT;
