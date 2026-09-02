import "server-only";
import { prisma } from "@/lib/prisma";
import { getUsableConnection } from "./connections";
import type { AvailableSlot } from "./provider";

/**
 * Sincronizzazione bidirezionale con i calendari esterni.
 *
 * Le due direzioni:
 *  - **in lettura** (`getAgentFreeSlots`): gli slot che l'agenzia ha inserito a
 *    mano restano la fonte di verità di *cosa* si può proporre, ma quelli che
 *    si sovrappongono a un impegno reale su Google/Outlook vengono scartati;
 *  - **in scrittura** (`createCalendarEvent`): l'appuntamento fissato dall'AI
 *    su WhatsApp compare nell'agenda dell'agente.
 *
 * Nessuna delle due lancia mai. Un calendario esterno irraggiungibile, un
 * token revocato o un errore del fornitore non devono impedire di fissare una
 * visita: si degrada sull'agenda interna, che funziona sempre. È lo stesso
 * principio di `deliverLeadToCrm` — l'integrazione è un miglioramento del
 * flusso, non un suo prerequisito.
 */

/** Orario di lavoro entro cui ha senso proporre una visita. */
const WORKDAY_START_HOUR = 9;
const WORKDAY_END_HOUR = 18;

/** Durata di una visita, quando la si deve dedurre invece di leggerla da uno slot. */
export const DEFAULT_VISIT_MINUTES = 30;

export interface BusyInterval {
  start: Date;
  end: Date;
}

/** Impegni dell'agente sul calendario collegato, nell'intervallo indicato. */
async function fetchBusyIntervals(
  userId: string,
  from: Date,
  to: Date
): Promise<BusyInterval[] | null> {
  const connection = await getUsableConnection(userId);
  if (!connection) return null;

  try {
    if (connection.provider === "google") {
      const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          items: [{ id: connection.calendarId }],
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) throw new Error(`freeBusy ha risposto ${response.status}`);

      const data = await response.json();
      const busy: Array<{ start: string; end: string }> =
        data.calendars?.[connection.calendarId]?.busy ?? [];

      return busy.map((item) => ({ start: new Date(item.start), end: new Date(item.end) }));
    }

    const response = await fetch("https://graph.microsoft.com/v1.0/me/calendar/getSchedule", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        schedules: [connection.accountEmail],
        startTime: { dateTime: from.toISOString(), timeZone: "UTC" },
        endTime: { dateTime: to.toISOString(), timeZone: "UTC" },
        availabilityViewInterval: 30,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) throw new Error(`getSchedule ha risposto ${response.status}`);

    const data = await response.json();
    const items: Array<{ start: { dateTime: string }; end: { dateTime: string } }> =
      data.value?.[0]?.scheduleItems ?? [];

    // Graph restituisce orari senza suffisso di fuso quando li si chiede in
    // UTC: la `Z` va aggiunta, o `new Date` li interpreterebbe come ora locale
    // del server e gli impegni risulterebbero spostati di un paio d'ore.
    const toUtcDate = (value: string) => new Date(value.endsWith("Z") ? value : `${value}Z`);

    return items.map((item) => ({
      start: toUtcDate(item.start.dateTime),
      end: toUtcDate(item.end.dateTime),
    }));
  } catch (error) {
    console.error("[calendar/sync] Lettura impegni fallita", { userId, error });
    return null;
  }
}

/**
 * Impegni reali di piu' agenti, in una sola passata.
 *
 * Le richieste partono insieme e non in fila: sono chiamate a servizi esterni
 * dentro un webhook che ha sessanta secondi in tutto, e su un'agenzia con
 * cinque agenti collegati la differenza fra parallelo e sequenziale e' fra due
 * secondi e dieci.
 *
 * Un agente il cui calendario non risponde semplicemente non compare nella
 * mappa, e chi legge tratta l'assenza come "nessun impegno noto": e' la stessa
 * scelta prudente di `getAgentFreeSlots`, dove un servizio muto non deve poter
 * cancellare l'agenda dell'agenzia.
 */
export async function fetchBusyIntervalsForAgents(
  agentIds: string[],
  from: Date,
  to: Date
): Promise<Map<string, BusyInterval[]>> {
  const mappa = new Map<string, BusyInterval[]>();
  if (agentIds.length === 0) return mappa;

  const esiti = await Promise.all(
    agentIds.map(async (id) => ({ id, busy: await fetchBusyIntervals(id, from, to) }))
  );

  for (const { id, busy } of esiti) {
    if (busy) mappa.set(id, busy);
  }

  return mappa;
}

function overlaps(slotStart: Date, slotEnd: Date, busy: BusyInterval[]): boolean {
  return busy.some((interval) => slotStart < interval.end && slotEnd > interval.start);
}

/**
 * Slot realmente liberi di un agente in una data, unendo le due fonti.
 *
 * Parte dagli slot manuali di quell'agente (o da quelli generici, che chiunque
 * può coprire) e ne toglie quelli occupati sul calendario esterno. Se il
 * calendario non è collegato o non risponde, restituisce le disponibilità
 * manuali così come sono: meglio proporre uno slot che *forse* è occupato che
 * non proporne nessuno e perdere il lead.
 */
export async function getAgentFreeSlots(agentId: string, date: Date): Promise<AvailableSlot[]> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: { organizationId: true },
  });
  if (!agent) return [];

  const slots = await prisma.calendarSlot.findMany({
    where: {
      organizationId: agent.organizationId,
      isBooked: false,
      startTime: { gte: dayStart, lt: dayEnd },
      // Gli slot generici (`assignedToId: null`) li può coprire chiunque:
      // escluderli lascerebbe fuori la maggior parte delle agende, dove gli
      // slot non sono assegnati a una persona precisa.
      OR: [{ assignedToId: agentId }, { assignedToId: null }],
    },
    orderBy: { startTime: "asc" },
  });

  const available = slots.map((slot) => ({
    id: slot.id,
    startTime: slot.startTime,
    endTime: slot.endTime,
    agentName: slot.agentName,
  }));

  if (available.length === 0) return [];

  const busy = await fetchBusyIntervals(agentId, dayStart, dayEnd);
  if (!busy || busy.length === 0) return available;

  return available.filter((slot) => !overlaps(slot.startTime, slot.endTime, busy));
}

/** Vero se l'orario cade in un giorno feriale dentro l'orario di lavoro. */
export function isWithinWorkingHours(date: Date): boolean {
  const day = date.getDay();
  const hour = date.getHours();
  return day !== 0 && day !== 6 && hour >= WORKDAY_START_HOUR && hour < WORKDAY_END_HOUR;
}

export interface CalendarEventData {
  /** Nome del lead: finisce nel titolo dell'evento. */
  leadName: string;
  /**
   * Telefono del lead, nel titolo accanto al nome.
   *
   * Sta nel TITOLO e non solo nella descrizione perche' l'agente guarda
   * l'agenda dal telefono, dove della descrizione si vede la prima riga se va
   * bene. Il numero da chiamare per dire "arrivo con dieci minuti di ritardo"
   * deve essere leggibile senza aprire l'evento.
   */
  leadPhone?: string | null;
  startTime: Date;
  endTime?: Date;
  /** Riferimento dell'immobile ("Rif. A102 — Trilocale Via Roma 12"). */
  propertyRef?: string | null;
  /** Indirizzo della visita, se noto. */
  location?: string | null;
  /** Telefono del lead e altre note operative per l'agente. */
  notes?: string | null;
}

/**
 * Inserisce la visita nel calendario collegato dell'agente.
 *
 * Chiamata quando l'assistente WhatsApp fissa un appuntamento. Restituisce
 * `false` — senza lanciare — quando non c'è un calendario collegato o la
 * scrittura non riesce: l'appuntamento resta comunque registrato nell'agenda
 * interna, che è la fonte di verità dell'agenzia.
 */
export async function createCalendarEvent(
  agentId: string,
  eventData: CalendarEventData
): Promise<boolean> {
  const connection = await getUsableConnection(agentId);
  if (!connection) return false;

  const startTime = eventData.startTime;
  const endTime =
    eventData.endTime ?? new Date(startTime.getTime() + DEFAULT_VISIT_MINUTES * 60 * 1000);

  // "Sopralluogo / Visita": l'assistente fissa entrambe le cose, e chi legge
  // l'agenda deve capire di cosa si tratta senza aprire l'evento.
  const title = [
    `Sopralluogo / Visita - ${eventData.leadName}`,
    eventData.leadPhone,
  ]
    .filter(Boolean)
    .join(" - ");
  const description = [
    eventData.propertyRef ? `Immobile: ${eventData.propertyRef}` : null,
    eventData.notes,
    "Appuntamento fissato automaticamente dall'assistente WhatsApp di PropertyTech.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    // Si scrive direttamente sulle API invece di passare dagli adapter di
    // `provider.ts`: quelli creano un evento minimo (solo orario e un titolo
    // fisso), mentre qui servono titolo con il nome del lead, luogo e note
    // con i dettagli dell'immobile — che è il punto di questa funzione.
    if (connection.provider === "google") {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendarId)}/events`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${connection.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summary: title,
            description,
            ...(eventData.location ? { location: eventData.location } : {}),
            start: { dateTime: startTime.toISOString(), timeZone: "Europe/Rome" },
            end: { dateTime: endTime.toISOString(), timeZone: "Europe/Rome" },
          }),
          signal: AbortSignal.timeout(10_000),
        }
      );

      if (!response.ok) throw new Error(`Google ha risposto ${response.status}`);
      return true;
    }

    const response = await fetch("https://graph.microsoft.com/v1.0/me/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: title,
        body: { contentType: "text", content: description },
        ...(eventData.location ? { location: { displayName: eventData.location } } : {}),
        start: { dateTime: startTime.toISOString(), timeZone: "UTC" },
        end: { dateTime: endTime.toISOString(), timeZone: "UTC" },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) throw new Error(`Graph ha risposto ${response.status}`);
    return true;
  } catch (error) {
    console.error("[calendar/sync] Creazione evento fallita", {
      agentId,
      provider: connection.provider,
      error,
    });
    return false;
  }
}
