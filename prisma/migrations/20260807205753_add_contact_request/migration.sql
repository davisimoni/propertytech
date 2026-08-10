-- CreateTable
CREATE TABLE "ContactRequest" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "agencyName" TEXT,
    "message" TEXT NOT NULL,
    "ipHash" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactRequest_createdAt_idx" ON "ContactRequest"("createdAt");

-- CreateIndex
CREATE INDEX "ContactRequest_ipHash_createdAt_idx" ON "ContactRequest"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "ContactRequest_email_createdAt_idx" ON "ContactRequest"("email", "createdAt");
