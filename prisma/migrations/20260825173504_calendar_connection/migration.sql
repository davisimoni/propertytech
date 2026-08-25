-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarConnection_organizationId_provider_idx" ON "CalendarConnection"("organizationId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarConnection_userId_provider_key" ON "CalendarConnection"("userId", "provider");

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

