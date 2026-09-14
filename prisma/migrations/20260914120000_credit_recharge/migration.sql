-- CreateTable
CREATE TABLE "CreditRecharge" (
    "id" TEXT NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditRecharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditRecharge_stripeSessionId_key" ON "CreditRecharge"("stripeSessionId");

-- CreateIndex
CREATE INDEX "CreditRecharge_organizationId_createdAt_idx" ON "CreditRecharge"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "CreditRecharge" ADD CONSTRAINT "CreditRecharge_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
