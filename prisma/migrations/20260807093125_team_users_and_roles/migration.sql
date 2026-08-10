-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'AGENT');

-- AlterTable
ALTER TABLE "CalendarSlot" ADD COLUMN     "assignedToId" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "assignedToId" TEXT;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'AGENT',
    "inviteTokenHash" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_inviteTokenHash_key" ON "User"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "User_organizationId_role_idx" ON "User"("organizationId", "role");

-- CreateIndex
CREATE INDEX "CalendarSlot_organizationId_assignedToId_idx" ON "CalendarSlot"("organizationId", "assignedToId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_assignedToId_idx" ON "Lead"("organizationId", "assignedToId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSlot" ADD CONSTRAINT "CalendarSlot_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Travaso dei dati: ogni Organization esistente diventa il proprio titolare.
--
-- Senza questo passaggio, spostando l'autenticazione su User gli account già
-- registrati non troverebbero più le proprie credenziali e resterebbero
-- chiusi fuori. Email e hash della password vengono copiati così come sono:
-- nessuno deve reimpostare nulla.
--
-- `NOT EXISTS` rende l'istruzione ripetibile senza creare duplicati.
-- ---------------------------------------------------------------------------
INSERT INTO "User" ("id", "email", "passwordHash", "firstName", "lastName", "role", "acceptedAt", "createdAt", "updatedAt", "organizationId")
SELECT
  gen_random_uuid()::text,
  o."email",
  o."passwordHash",
  o."firstName",
  o."lastName",
  'OWNER'::"UserRole",
  o."createdAt",
  o."createdAt",
  NOW(),
  o."id"
FROM "Organization" o
WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u."organizationId" = o."id");
