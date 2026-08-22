import "server-only";
import type { CalendarSlot } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Quanti slot proporre al cliente qualificato nel messaggio WhatsApp. */
export const PROPOSED_SLOTS_COUNT = 2;

/**
 * Formatta uno slot per il messaggio WhatsApp: "lunedì 4 agosto alle 15:30
 * con Mario". Accetta la forma minima (non l'intero `CalendarSlot`) perché
 * la usano anche gli adapter esterni in `lib/calendar/provider.ts`, dove non
 * esiste un nome agente associato allo slot.
 */
export function formatSlotForChat(slot: { startTime: Date; agentName: string }): string {
  const formatted = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  }).format(slot.startTime);

  return slot.agentName ? `${formatted} con ${slot.agentName}` : formatted;
}

/**
 * Primi slot liberi futuri dell'agenzia, in ordine cronologico.
 * Gli slot già passati sono esclusi: proporre un orario trascorso è peggio
 * che non proporne nessuno.
 */
export async function getAvailableSlots(
  organizationId: string,
  limit = PROPOSED_SLOTS_COUNT
): Promise<CalendarSlot[]> {
  return prisma.calendarSlot.findMany({
    where: {
      organizationId,
      isBooked: false,
      startTime: { gt: new Date() },
    },
    orderBy: { startTime: "asc" },
    take: limit,
  });
}

/**
 * Prenota uno slot per un lead.
 *
 * L'`updateMany` con `isBooked: false` nel filtro è la guardia contro la doppia
 * prenotazione: se due conversazioni scelgono lo stesso slot in parallelo, la
 * seconda aggiorna 0 righe e riceve `false` invece di sovrascrivere la prima.
 */
export async function bookSlot(
  organizationId: string,
  slotId: string,
  leadId: string
): Promise<CalendarSlot | null> {
  const claimed = await prisma.calendarSlot.updateMany({
    where: { id: slotId, organizationId, isBooked: false },
    data: { isBooked: true },
  });

  if (claimed.count === 0) return null;

  const slot = await prisma.calendarSlot.findUnique({ where: { id: slotId } });
  if (!slot) return null;

  await prisma.lead.update({
    where: { id: leadId },
    data: { calendarSlotId: slot.id, appointmentSlot: slot.startTime },
  });

  return slot;
}
