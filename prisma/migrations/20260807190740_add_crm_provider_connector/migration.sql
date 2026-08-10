-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "crmAuthToken" TEXT,
ADD COLUMN     "crmAuthUser" TEXT,
ADD COLUMN     "crmFieldMap" JSONB,
ADD COLUMN     "crmProvider" TEXT;
