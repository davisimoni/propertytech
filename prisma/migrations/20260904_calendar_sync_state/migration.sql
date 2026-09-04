-- AlterTable
ALTER TABLE "CalendarSlot" ADD COLUMN     "externalCalendarEmail" TEXT,
ADD COLUMN     "externalEventId" TEXT,
ADD COLUMN     "externalSyncedAt" TIMESTAMP(3);

