-- CreateTable
CREATE TABLE "SocialConnection" (
    "id" TEXT NOT NULL,
    "facebookPageId" TEXT NOT NULL,
    "facebookPageName" TEXT NOT NULL,
    "instagramUserId" TEXT,
    "instagramUsername" TEXT,
    "accessToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialConnection_organizationId_key" ON "SocialConnection"("organizationId");

-- AddForeignKey
ALTER TABLE "SocialConnection" ADD CONSTRAINT "SocialConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

