import "server-only";
import type { Lead, WhatsAppConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessageForProvider } from "./client";
import { appendMessage } from "./chat-history";
import { resolveWhatsAppCredentials } from "./credentials";

/**
 * Promemoria anti no-show (Modulo 1).
 *
 * Il mancato presentarsi a una visita è il costo operativo più concreto di
 * un'agenzia: l'agente si sposta, apre l'immobile e aspetta a vuoto. Un
 * messaggio a poche ore dall'appuntamento trasforma quel buco in uno slot che
 * torna disponibile per qualcun altro.
 */

/** Ampiezza della finestra di scansione: copre i ritardi fra un giro e l'altro
 *  dello scheduler senza rischiare di saltare un appuntamento. */
const WINDOW_MINUTES = 90;

/** Quanti promemoria al massimo per esecuzione, per non far scadere la richiesta. */
const MAX_PER_RUN = 100;

const TIME_FORMAT = new Intl.DateTimeFormat("it-IT", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

const DAY_FORMAT = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "short",
  timeZone: "Europe/Rome",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

/**
 * Testo del promemoria.
 *
 * Dice "oggi" solo quando l'appuntamento è davvero oggi: con un anticipo di 24
 * ore il messaggio parte il giorno prima, e un "oggi" sbagliato è il modo più
 * rapido per far presentare il cliente nel giorno sbagliato.
 *
 * Forma di cortesia come il resto della comunicazione verso il cliente finale
 * (vedi CLAUDE.md §1): la GUI dà del "tu" all'agente, l'agenzia dà del "lei" a
 * chi ha appena chiesto informazioni da un portale.
 */
export function buildReminderMessage(
  clientName: string,
  appointmentAt: Date,
  propertyRef: string,
  now: Date = new Date()
): string {
  // Il confronto è sulla data resa nel fuso di Roma, non su quella del server:
  // a mezzanotte UTC il giorno italiano è già cambiato da un pezzo.
  const sameDay = DAY_FORMAT.format(appointmentAt) === DAY_FORMAT.format(now);

  const when = sameDay
    ? `oggi alle ${TIME_FORMAT.format(appointmentAt)}`
    : DATE_TIME_FORMAT.format(appointmentAt);

  return [
    `Buongiorno ${clientName}, le ricordiamo l'appuntamento di ${when} per l'immobile in ${propertyRef}.`,
    "Ci sarà? Risponda SI per confermare o NO per cancellare.",
  ].join(" ");
}

/** Conferma inviata a chi risponde SI. */
export const REMINDER_CONFIRMED_REPLY =
  "Perfetto, la aspettiamo. A presto!";

/** Conferma inviata a chi disdice, senza far pesare la rinuncia. */
export const REMINDER_CANCELLED_REPLY =
  "Grazie per averci avvisato. Abbiamo annullato l'appuntamento: se vuole riprogrammarlo, un nostro agente la ricontatterà a breve.";

/**
 * Interpreta la risposta al promemoria.
 *
 * Volutamente deterministico e non affidato al modello: liberare uno slot in
 * agenda è un'azione irreversibile, e non deve dipendere da come l'AI legge una
 * frase. Riconosce solo risposte brevi e inequivocabili; qualsiasi altra cosa
 * torna `null` e prosegue nel flusso conversazionale normale.
 */
export function parseReminderReply(text: string): "yes" | "no" | null {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\p{L}\s]/gu, "")
    .trim();

  if (!normalized) return null;

  const words = normalized.split(/\s+/);
  if (words.length > 3) return null;

  const YES = ["si", "s", "certo", "confermo", "ok", "okay", "yes", "presente"];
  // Volutamente senza la particella "non": è una negazione, non una risposta.
  // Con "non" in elenco, un cliente che scrive "non lo so" si vedrebbe
  // cancellare l'appuntamento invece di ricevere una richiesta di conferma.
  const NO = ["no", "n", "annulla", "annullare", "disdico", "cancella", "cancellare", "nope"];

  /** Frasi intere accettate: arrivano come più parole e non come singolo token. */
  const YES_PHRASES = ["ci saro", "ci sono", "va bene", "tutto ok", "confermo si"];
  const NO_PHRASES = ["non ci saro", "non posso", "non riesco", "non vengo", "no grazie"];

  const hasYes = words.some((word) => YES.includes(word)) || YES_PHRASES.includes(normalized);
  const hasNo = words.some((word) => NO.includes(word)) || NO_PHRASES.includes(normalized);

  // "si o no" contiene entrambi: nel dubbio non si tocca l'agenda e il
  // messaggio prosegue nel flusso conversazionale normale.
  if (hasYes === hasNo) return null;

  return hasYes ? "yes" : "no";
}

/**
 * Il lead è in attesa di rispondere al promemoria?
 *
 * Solo se il promemoria è partito, non ha ancora risposto e l'appuntamento è
 * ancora futuro: dopo l'orario della visita un "no" non ha più nulla da
 * liberare, e il messaggio va trattato come conversazione ordinaria.
 */
export function isAwaitingReminderReply(lead: Lead, now: Date = new Date()): boolean {
  return (
    lead.reminderSentAt !== null &&
    lead.appointmentConfirmed === null &&
    lead.appointmentSlot !== null &&
    lead.appointmentSlot > now
  );
}

/**
 * Registra la risposta al promemoria e, in caso di disdetta, libera lo slot.
 *
 * Lo stato è aggiornato prima dell'invio della conferma: se la Cloud API
 * fallisce, l'agenda risulta comunque liberata — mai il contrario, che
 * lascerebbe l'agente ad aspettare un cliente che ha già disdetto.
 */
export async function applyReminderReply(
  lead: Lead,
  config: WhatsAppConfig,
  reply: "yes" | "no"
): Promise<void> {
  if (reply === "yes") {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { appointmentConfirmed: true },
    });
  } else {
    // La riga del lead e lo slot in agenda si muovono insieme: uno slot che
    // resta `isBooked` per un appuntamento annullato è tempo dell'agente
    // perso, e nessuno se ne accorgerebbe fino al giorno della visita.
    await prisma.$transaction([
      prisma.lead.update({
        where: { id: lead.id },
        data: {
          appointmentConfirmed: false,
          appointmentSlot: null,
          calendarSlotId: null,
        },
      }),
      ...(lead.calendarSlotId
        ? [
            prisma.calendarSlot.update({
              where: { id: lead.calendarSlotId },
              data: { isBooked: false },
            }),
          ]
        : []),
    ]);

    // Segnalazione all'agente: la scheda lead e la pipeline mostrano subito lo
    // stato "Ha disdetto", ed è ciò che l'agente vede al primo sguardo.
    console.warn("[whatsapp/reminders] Appuntamento annullato dal cliente", {
      leadId: lead.id,
      organizationId: lead.organizationId,
      slotFreed: lead.calendarSlotId ?? null,
    });
  }

  const text = reply === "yes" ? REMINDER_CONFIRMED_REPLY : REMINDER_CANCELLED_REPLY;

  await appendMessage(lead.id, {
    sender: "bot",
    text,
    timestamp: new Date().toISOString(),
  });

  try {
    await sendWhatsAppMessageForProvider(
          resolveWhatsAppCredentials(config),
          lead.clientPhone,
          text,
          lead.waChatJid
        );
  } catch (error) {
    console.error("[whatsapp/reminders] Conferma non recapitata", { leadId: lead.id, error });
  }
}

export interface ReminderRunResult {
  sent: number;
  failed: number;
  scanned: number;
}

/**
 * Invia i promemoria dovuti in questo momento.
 *
 * Pensata per essere chiamata da uno scheduler esterno a cadenza regolare
 * (vedi app/api/cron/appointment-reminders). Non consuma crediti WhatsApp: il
 * credito misura la conversazione avviata, e questo messaggio appartiene a una
 * conversazione già pagata — oltre al fatto che bloccare un promemoria per
 * crediti esauriti farebbe saltare una visita già fissata.
 */
export async function sendDueReminders(now: Date = new Date()): Promise<ReminderRunResult> {
  const configs = await prisma.whatsAppConfig.findMany({
    where: { isConnected: true, reminderEnabled: true },
  });

  let sent = 0;
  let failed = 0;
  let scanned = 0;

  for (const config of configs) {
    const target = new Date(now.getTime() + config.reminderHoursBefore * 60 * 60 * 1000);
    const windowStart = new Date(target.getTime() - WINDOW_MINUTES * 60 * 1000);

    const leads = await prisma.lead.findMany({
      where: {
        organizationId: config.organizationId,
        // Solo appuntamenti realmente fissati e ancora futuri.
        appointmentSlot: { gte: windowStart, lte: target },
        // `null` è la guardia di idempotenza: un secondo giro nella stessa
        // finestra non reinvia nulla.
        reminderSentAt: null,
        // Un contatto che ha revocato il consenso non riceve più nulla, nemmeno
        // un promemoria di servizio (CLAUDE.md §5).
        qualificationStatus: { not: "OPT_OUT" },
      },
      take: MAX_PER_RUN,
    });

    scanned += leads.length;

    for (const lead of leads) {
      if (!lead.appointmentSlot) continue;

      const text = buildReminderMessage(
        lead.clientName,
        lead.appointmentSlot,
        lead.propertyRef,
        now
      );

      try {
        await sendWhatsAppMessageForProvider(
          resolveWhatsAppCredentials(config),
          lead.clientPhone,
          text,
          lead.waChatJid
        );

        // `reminderSentAt` è scritto solo dopo un invio riuscito: se la Cloud
        // API è giù, il prossimo giro riproverà invece di considerare
        // avvisato un cliente che non ha ricevuto nulla.
        await prisma.lead.update({
          where: { id: lead.id },
          data: { reminderSentAt: new Date() },
        });

        await appendMessage(lead.id, {
          sender: "bot",
          text,
          timestamp: new Date().toISOString(),
        });

        sent++;
      } catch (error) {
        failed++;
        console.error("[whatsapp/reminders] Invio promemoria non riuscito", {
          leadId: lead.id,
          error,
        });
      }
    }
  }

  return { sent, failed, scanned };
}
