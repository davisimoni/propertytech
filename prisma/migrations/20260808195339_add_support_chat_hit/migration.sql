-- CreateTable
CREATE TABLE "SupportChatHit" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportChatHit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportChatHit_ipHash_createdAt_idx" ON "SupportChatHit"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "SupportChatHit_createdAt_idx" ON "SupportChatHit"("createdAt");
