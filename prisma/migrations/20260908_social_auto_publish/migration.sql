-- AlterTable
ALTER TABLE "SocialConnection" ADD COLUMN     "facebookAutoPublish" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "instagramAutoPublish" BOOLEAN NOT NULL DEFAULT true;

