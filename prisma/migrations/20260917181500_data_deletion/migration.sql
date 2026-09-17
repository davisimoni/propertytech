-- AlterTable
ALTER TABLE "SocialConnection" ADD COLUMN     "facebookUserId" TEXT;

-- CreateTable
CREATE TABLE "DataDeletionRequest" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "facebookUserId" TEXT NOT NULL,
    "eliminati" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DataDeletionRequest_code_key" ON "DataDeletionRequest"("code");

-- CreateIndex
CREATE INDEX "DataDeletionRequest_facebookUserId_idx" ON "DataDeletionRequest"("facebookUserId");

-- CreateIndex
CREATE INDEX "SocialConnection_facebookUserId_idx" ON "SocialConnection"("facebookUserId");

