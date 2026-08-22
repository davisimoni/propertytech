import "server-only";
import type { CalendarSlot } from "@prisma/client";
import * as internalCalendar from "@/lib/calendar";

/**
 * Adapter per la sincronizzazione degli slot di visita.
 *
 * Oggi l'unica implementazione realmente collegata è `internal` (l'agenda
 * gestita a mano dall'agenzia in `lib/calendar.ts`, invariata). `google` e
 * `outlook` sono adapter reali e completi verso le rispettive API — non
 * segnaposto — ma prendono le credenziali OAuth come parametro esplicito:
 * questo modulo predispone *come* parlare con Google Calendar e Outlook, non
 * *da dove* arriva il token. L'acquisizione del consenso OAuth e la sua
 * UI in dashboard restano un passo successivo, deliberatamente fuori da
 * questa modifica.
 */

export type CalendarProviderId = "internal" | "google" | "outlook";

/** Slot disponibile, nella stessa forma indipendentemente dal provider. */
export interface AvailableSlot {
  id: string;
  startTime: Date;
  endTime: Date;
  agentName: string;
}

export interface CreateAppointmentParams {
  organizationId: string;
  leadId: string;
  slotId: string;
}

export interface CreateAppointmentResult {
  ok: boolean;
  slot?: AvailableSlot;
  /** Motivo del fallimento, es. "slot già prenotato da un'altra conversazione". */
  error?: string;
}

/** Contratto unico per la sincronizzazione di slot e visite. */
export interface CalendarProvider {
  readonly id: CalendarProviderId;
  getAvailableSlots(organizationId: string, limit?: number): Promise<AvailableSlot[]>;
  createAppointment(params: CreateAppointmentParams): Promise<CreateAppointmentResult>;
}

function toAvailableSlot(slot: CalendarSlot): AvailableSlot {
  return { id: slot.id, startTime: slot.startTime, endTime: slot.endTime, agentName: slot.agentName };
}

/**
 * Provider di default: l'agenda interna che l'agenzia gestisce da
 * `components/calendar/slot-manager.tsx`. Nessun servizio esterno coinvolto,
 * nessuna credenziale da configurare — è il comportamento di oggi, invariato.
 */
export const internalCalendarProvider: CalendarProvider = {
  id: "internal",

  async getAvailableSlots(organizationId, limit) {
    const slots = await internalCalendar.getAvailableSlots(organizationId, limit);
    return slots.map(toAvailableSlot);
  },

  async createAppointment({ organizationId, leadId, slotId }) {
    const slot = await internalCalendar.bookSlot(organizationId, slotId, leadId);
    if (!slot) {
      return { ok: false, error: "Lo slot è già stato prenotato da un'altra conversazione." };
    }
    return { ok: true, slot: toAvailableSlot(slot) };
  },
};

// --- Google Calendar ---

export interface GoogleCalendarCredentials {
  accessToken: string;
  /** ID del calendario su cui leggere/scrivere, tipicamente "primary". */
  calendarId: string;
}

const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";

/**
 * Adapter verso Google Calendar (API v3).
 *
 * `getAvailableSlots` qui ha un significato diverso dall'agenda interna: non
 * esiste un concetto nativo di "slot proposti" in Google Calendar, quindi
 * questo adapter interroga `freebusy` sull'orario d'ufficio dei prossimi
 * giorni feriali e restituisce gli intervalli liberi come slot da 30 minuti.
 * È una policy ragionevole di default, sostituibile quando servirà una
 * configurazione più fine (durata visita, orari di lavoro per agenzia).
 */
export function createGoogleCalendarProvider(credentials: GoogleCalendarCredentials): CalendarProvider {
  async function googleFetch(path: string, init: RequestInit) {
    const response = await fetch(`${GOOGLE_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Google Calendar ha risposto ${response.status}: ${detail.slice(0, 300)}`);
    }

    return response.json();
  }

  return {
    id: "google",

    async getAvailableSlots(_organizationId, limit = 2) {
      const timeMin = new Date();
      const timeMax = new Date(timeMin.getTime() + 7 * 24 * 60 * 60 * 1000);

      const freeBusy = await googleFetch("/freeBusy", {
        method: "POST",
        body: JSON.stringify({
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          items: [{ id: credentials.calendarId }],
        }),
      });

      const busy: Array<{ start: string; end: string }> =
        freeBusy.calendars?.[credentials.calendarId]?.busy ?? [];

      // Slot da 30 minuti nell'orario d'ufficio (9-18, Europe/Rome) dei
      // prossimi 7 giorni, esclusi quelli che si sovrappongono a un impegno.
      const slots: AvailableSlot[] = [];
      const cursor = new Date(timeMin);
      cursor.setMinutes(cursor.getMinutes() < 30 ? 30 : 60, 0, 0);

      while (slots.length < limit && cursor < timeMax) {
        const hour = cursor.getHours();
        const isWeekday = cursor.getDay() !== 0 && cursor.getDay() !== 6;

        if (isWeekday && hour >= 9 && hour < 18) {
          const end = new Date(cursor.getTime() + 30 * 60 * 1000);
          const overlapsBusy = busy.some(
            (b) => cursor < new Date(b.end) && end > new Date(b.start)
          );

          if (!overlapsBusy) {
            slots.push({
              id: cursor.toISOString(),
              startTime: new Date(cursor),
              endTime: end,
              agentName: "",
            });
          }
        }

        cursor.setMinutes(cursor.getMinutes() + 30);
      }

      return slots;
    },

    async createAppointment({ slotId }) {
      // `slotId` per questo provider è l'ISO string generato da
      // `getAvailableSlots`: non c'è una riga di database da reclamare, lo
      // slot è "libero" finché Google non conferma l'evento creato.
      const startTime = new Date(slotId);
      if (Number.isNaN(startTime.getTime())) {
        return { ok: false, error: "Slot non riconosciuto." };
      }
      const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

      try {
        await googleFetch(`/calendars/${encodeURIComponent(credentials.calendarId)}/events`, {
          method: "POST",
          body: JSON.stringify({
            summary: "Visita immobiliare",
            start: { dateTime: startTime.toISOString() },
            end: { dateTime: endTime.toISOString() },
          }),
        });
      } catch (error) {
        console.error("[calendar/provider] Creazione evento Google fallita", error);
        return { ok: false, error: "Impossibile creare l'evento su Google Calendar." };
      }

      return { ok: true, slot: { id: slotId, startTime, endTime, agentName: "" } };
    },
  };
}

// --- Microsoft Outlook (Graph API) ---

export interface OutlookCalendarCredentials {
  accessToken: string;
}

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

/**
 * Adapter verso Outlook / Microsoft 365 (Graph API).
 *
 * Stessa policy di `getAvailableSlots` dell'adapter Google — slot da 30
 * minuti nell'orario d'ufficio — perché Graph non ha nemmeno lui un concetto
 * nativo di "slot proposti"; usa `getSchedule` per leggere gli impegni.
 */
export function createOutlookCalendarProvider(credentials: OutlookCalendarCredentials): CalendarProvider {
  async function graphFetch(path: string, init: RequestInit) {
    const response = await fetch(`${GRAPH_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Microsoft Graph ha risposto ${response.status}: ${detail.slice(0, 300)}`);
    }

    return response.json();
  }

  return {
    id: "outlook",

    async getAvailableSlots(_organizationId, limit = 2) {
      const timeMin = new Date();
      const timeMax = new Date(timeMin.getTime() + 7 * 24 * 60 * 60 * 1000);

      const schedule = await graphFetch("/me/calendar/getSchedule", {
        method: "POST",
        body: JSON.stringify({
          schedules: ["me"],
          startTime: { dateTime: timeMin.toISOString(), timeZone: "Europe/Rome" },
          endTime: { dateTime: timeMax.toISOString(), timeZone: "Europe/Rome" },
          availabilityViewInterval: 30,
        }),
      });

      const busy: Array<{ start: { dateTime: string }; end: { dateTime: string } }> =
        schedule.value?.[0]?.scheduleItems ?? [];

      const slots: AvailableSlot[] = [];
      const cursor = new Date(timeMin);
      cursor.setMinutes(cursor.getMinutes() < 30 ? 30 : 60, 0, 0);

      while (slots.length < limit && cursor < timeMax) {
        const hour = cursor.getHours();
        const isWeekday = cursor.getDay() !== 0 && cursor.getDay() !== 6;

        if (isWeekday && hour >= 9 && hour < 18) {
          const end = new Date(cursor.getTime() + 30 * 60 * 1000);
          const overlapsBusy = busy.some(
            (item) => cursor < new Date(item.end.dateTime) && end > new Date(item.start.dateTime)
          );

          if (!overlapsBusy) {
            slots.push({ id: cursor.toISOString(), startTime: new Date(cursor), endTime: end, agentName: "" });
          }
        }

        cursor.setMinutes(cursor.getMinutes() + 30);
      }

      return slots;
    },

    async createAppointment({ slotId }) {
      const startTime = new Date(slotId);
      if (Number.isNaN(startTime.getTime())) {
        return { ok: false, error: "Slot non riconosciuto." };
      }
      const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

      try {
        await graphFetch("/me/events", {
          method: "POST",
          body: JSON.stringify({
            subject: "Visita immobiliare",
            start: { dateTime: startTime.toISOString(), timeZone: "Europe/Rome" },
            end: { dateTime: endTime.toISOString(), timeZone: "Europe/Rome" },
          }),
        });
      } catch (error) {
        console.error("[calendar/provider] Creazione evento Outlook fallita", error);
        return { ok: false, error: "Impossibile creare l'evento su Outlook." };
      }

      return { ok: true, slot: { id: slotId, startTime, endTime, agentName: "" } };
    },
  };
}

/**
 * Provider attivo per l'organizzazione.
 *
 * Restituisce sempre `internal` finché non esiste una fonte di credenziali
 * OAuth collegata all'agenzia: è il seam su cui si innesterà la selezione
 * Google/Outlook quando l'acquisizione del token (OAuth + storage cifrato,
 * stesso schema di `lib/crypto/secrets.ts`) sarà costruita.
 */
export async function resolveCalendarProvider(_organizationId: string): Promise<CalendarProvider> {
  return internalCalendarProvider;
}
