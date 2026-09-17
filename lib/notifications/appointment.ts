import "server-only";
import type { Lead } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "./email";

/**
 * Conferma via email al cliente quando l'assistente fissa un appuntamento.
 *
 * # Solo al cliente
 *
 * Fino al 17 settembre 2026 partiva anche un avviso all'agenzia. Non parte
 * più: le email di sistema sono limitate agli eventi critici dell'account
 * (`lib/email/transactional.ts`), e l'appuntamento è già nell'agenda
 * dell'agente e nella scheda del lead.
 *
 * Questa invece resta, perché non è una notifica dell'account: è la conferma
 * di un impegno che l'agenzia prende con il proprio cliente.
 *
 * # Perché il testo semplice e non il layout condiviso
 *
 * Perché `renderEmail` firma in fondo "PropertyTech" e parla di un account su
 * PropertyTech. Il cliente dell'agenzia non ha un account da noi: ha parlato
 * con un'agenzia immobiliare, e vedersi arrivare la conferma col marchio di un
 * fornitore che non conosce fa sembrare l'agenzia una filiale di qualcos'altro.
 * La mail esce a nome dell'agenzia, in forma di cortesia (CLAUDE.md §1).
 *
 * # Non lancia mai
 *
 * L'appuntamento è già fissato e già scritto sul calendario dell'agente. Una
 * casella di posta che non risponde non deve poter trasformare una visita
 * concordata in un errore.
 */

const DATA_ORA = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

/** Sopralluogo o visita: chi legge deve sapere cosa va a fare. */
export function tipoAppuntamento(lead: Lead): string {
  return lead.intent === "VENDITA" || lead.intent === "ENTRAMBI"
    ? "Sopralluogo di valutazione (venditore)"
    : "Visita immobile (acquirente)";
}

/**
 * Email al cliente: la scrive l'agenzia, in forma di cortesia.
 *
 * Esportata per poterla provare: è testo che esce a nome di un'agenzia verso
 * un suo cliente, e una copia riscritta nel test direbbe di sì anche il
 * giorno in cui l'originale sbaglia il nome o il tono.
 */
export function corpoCliente(params: {
  lead: Lead;
  agencyName: string;
  quando: string;
  agentName: string | null;
}): string {
  const { lead, agencyName, quando, agentName } = params;
  const perVenditore = lead.intent === "VENDITA" || lead.intent === "ENTRAMBI";

  const oggetto = perVenditore
    ? [lead.sellerPropertyComune, lead.sellerPropertyZona].filter(Boolean).join(", ")
    : lead.propertyRef;

  return [
    `Gentile ${lead.clientName},`,
    "",
    perVenditore
      ? "le confermiamo l'appuntamento per il sopralluogo di valutazione del suo immobile."
      : "le confermiamo l'appuntamento per la visita all'immobile.",
    "",
    `Quando:   ${quando}`,
    oggetto ? `Immobile: ${oggetto}` : null,
    agentName ? `Con:      ${agentName}` : null,
    "",
    perVenditore
      ? "Un nostro agente sarà presente per visionare l'immobile e fornirle una valutazione basata sul mercato della zona."
      : "Un nostro agente sarà presente per accompagnarla nella visita e rispondere alle sue domande.",
    "",
    "Se dovesse avere un imprevisto, ci scriva pure su WhatsApp: troveremo un'altra disponibilità.",
    "",
    "Cordiali saluti,",
    agencyName,
  ]
    .filter((riga) => riga !== null)
    .join("\n");
}

/**
 * Invia la conferma al cliente, se ne abbiamo l'indirizzo. Non lancia mai.
 *
 * Chiamata dopo che il messaggio WhatsApp è già partito: il cliente ha la sua
 * risposta in chat, e la posta non deve allungare l'attesa. Il silenzio quando
 * l'indirizzo manca è voluto: la conferma vera l'ha già ricevuta su WhatsApp.
 */
export async function notifyAppointmentConfirmed(lead: Lead): Promise<void> {
  try {
    if (!lead.appointmentSlot || !lead.clientEmail) return;

    const [organization, slot] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: lead.organizationId },
        select: { agencyName: true },
      }),
      lead.calendarSlotId
        ? prisma.calendarSlot.findUnique({
            where: { id: lead.calendarSlotId },
            select: { agentName: true },
          })
        : null,
    ]);

    const agencyName = organization?.agencyName ?? "la nostra agenzia";

    const outcome = await sendEmail({
      to: lead.clientEmail,
      subject: `Conferma appuntamento - ${agencyName}`,
      text: corpoCliente({
        lead,
        agencyName,
        quando: DATA_ORA.format(lead.appointmentSlot),
        agentName: slot?.agentName || null,
      }),
    });

    console.info("[EMAIL-APPOINTMENT-SENT]", {
      leadId: lead.id,
      organizationId: lead.organizationId,
      quando: lead.appointmentSlot.toISOString(),
      tipo: tipoAppuntamento(lead),
      cliente: outcome,
    });
  } catch (error) {
    console.error("[notifications/appointment] Conferma non inviata", {
      leadId: lead.id,
      error,
    });
  }
}
