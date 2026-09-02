import "server-only";
import type { Lead } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/seo";
import { sendEmail } from "./email";
import { resolveLeadOwner } from "@/lib/email/recipients";
import { PROPERTY_TYPE_LABELS } from "@/lib/listings/property-fields";

/**
 * Le due email che partono quando l'assistente fissa un appuntamento.
 *
 * # Perché due, e perché non si somigliano
 *
 * Parlano a due persone diverse e in due lingue diverse. Al **cliente** scrive
 * l'agenzia, in forma di cortesia, per confermare un impegno preso: data, ora,
 * immobile, e che troverà una persona ad aspettarlo. All'**agenzia** scriviamo
 * noi, dandole del tu, con la scheda di chi si presenterà e cosa cerca — così
 * chi va all'appuntamento ci arriva sapendo con chi ha a che fare.
 *
 * # Perché il testo semplice e non il layout condiviso
 *
 * Perché `renderEmail` firma in fondo "PropertyTech" e "ricevi questa email
 * perché hai un account su PropertyTech". Vero per l'agenzia, falso per il suo
 * cliente: quella persona non ha un account da noi, ha parlato con
 * un'agenzia immobiliare, e vedersi arrivare la conferma col marchio di un
 * fornitore che non conosce fa sembrare l'agenzia una filiale di qualcos'altro.
 * La mail al cliente esce a nome dell'agenzia e finisce lì (CLAUDE.md §1).
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
 * Esportata per poterla provare: e' testo che esce a nome di un'agenzia verso
 * un suo cliente, e una copia riscritta nel test direbbe di si' anche il
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

/** Email all'agenzia: la scheda di chi si presentera'. Esportata per i test. */
export function corpoAgenzia(params: {
  lead: Lead;
  quando: string;
  agentName: string | null;
  recipientName: string;
}): string {
  const { lead, quando, agentName, recipientName } = params;
  const perVenditore = lead.intent === "VENDITA" || lead.intent === "ENTRAMBI";

  const nonDichiarato = (valore: string | number | null | undefined) =>
    valore === null || valore === undefined || valore === "" ? "non dichiarato" : String(valore);

  const righe: (string | null)[] = [
    recipientName ? `Ciao ${recipientName},` : "Ciao,",
    "",
    "l'assistente ha fissato un appuntamento su WhatsApp.",
    "",
    "--- APPUNTAMENTO ---",
    `Quando:   ${quando}`,
    `Tipo:     ${tipoAppuntamento(lead)}`,
    agentName ? `Agente:   ${agentName}` : null,
    "",
    "--- CONTATTO ---",
    `Nome:     ${lead.clientName}`,
    `Telefono: ${lead.clientPhone}`,
    lead.clientEmail ? `Email:    ${lead.clientEmail}` : null,
    "",
  ];

  if (perVenditore) {
    righe.push(
      "--- IMMOBILE DA VALUTARE ---",
      `Ubicazione: ${nonDichiarato(
        [lead.sellerPropertyComune, lead.sellerPropertyZona].filter(Boolean).join(", ")
      )}`,
      `Tipologia:  ${lead.sellerPropertyType ? PROPERTY_TYPE_LABELS[lead.sellerPropertyType] : "non dichiarata"}`,
      `Superficie: ${lead.sellerPropertySquareMeters ? `${lead.sellerPropertySquareMeters} mq circa` : "non dichiarata"}`,
      `Stato:      ${nonDichiarato(lead.sellerPropertyCondition)}`,
      `Vuole vendere: ${nonDichiarato(lead.sellerTimeframe)}`,
      ""
    );
  }

  if (!perVenditore || lead.intent === "ENTRAMBI") {
    righe.push(
      "--- COSA CERCA ---",
      `Immobile:   ${lead.propertyRef}`,
      `Zona:       ${nonDichiarato(lead.preferredZone)}`,
      `Tipologia:  ${lead.preferredType ? PROPERTY_TYPE_LABELS[lead.preferredType] : "non dichiarata"}`,
      `Budget:     ${
        lead.budgetMax
          ? `fino a ${new Intl.NumberFormat("it-IT").format(lead.budgetMax)} €`
          : nonDichiarato(lead.budget)
      }`,
      `Superficie minima: ${lead.minSquareMeters ? `${lead.minSquareMeters} mq` : "non dichiarata"}`,
      "",
      "--- QUALIFICA ---",
      `Mutuo/liquidità:   ${
        lead.mortgageApproved === null ? "non emerso" : lead.mortgageApproved ? "sì" : "no"
      }`,
      `Deve vendere prima: ${
        lead.mustSellFirst === null ? "non emerso" : lead.mustSellFirst ? "sì" : "no"
      }`,
      `Tempistica:         ${nonDichiarato(lead.timeframe)}`,
      ""
    );
  }

  righe.push(
    // Alla scheda aperta: `?lead=` è letto da /leads per aprire subito il
    // cassetto giusto, invece di far cercare il nome in tabella.
    `Apri la scheda: ${SITE_URL}/leads?lead=${lead.id}`,
    "",
    "— PropertyTech"
  );

  return righe.filter((riga) => riga !== null).join("\n");
}

/**
 * Invia le due conferme. Non lancia mai.
 *
 * Chiamata dopo che il messaggio WhatsApp è già partito: il cliente ha la sua
 * risposta in chat, e la posta non deve allungare l'attesa di una conferma che
 * lui aspetta lì.
 */
export async function notifyAppointmentConfirmed(lead: Lead): Promise<void> {
  try {
    if (!lead.appointmentSlot) return;

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
    const agentName = slot?.agentName || null;
    const quando = DATA_ORA.format(lead.appointmentSlot);

    // --- 1. Al cliente, se abbiamo un indirizzo -----------------------------
    //
    // Il silenzio quando manca è voluto: la mail del contatto si ha solo se
    // l'agenzia ce l'aveva in rubrica o il cliente l'ha scritta, e la
    // conferma vera l'ha già ricevuta su WhatsApp. Nessun motivo di segnalare
    // come problema qualcosa che non lo è.
    let esitoCliente: string | null = null;
    if (lead.clientEmail) {
      const outcome = await sendEmail({
        to: lead.clientEmail,
        subject: `Conferma Appuntamento - ${agencyName}`,
        text: corpoCliente({ lead, agencyName, quando, agentName }),
      });
      esitoCliente = String(outcome);
    }

    // --- 2. All'agenzia ----------------------------------------------------
    const recipient = await resolveLeadOwner(lead.organizationId, lead.assignedToId);
    let esitoAgenzia: string | null = null;

    if (recipient) {
      const outcome = await sendEmail({
        to: recipient.email,
        subject: `📅 Nuovo Appuntamento Fissato da AI - ${lead.clientName}`,
        text: corpoAgenzia({
          lead,
          quando,
          agentName,
          recipientName: recipient.firstName ?? "",
        }),
        /*
         * La risposta va al cliente, quando ne abbiamo l'indirizzo.
         *
         * Chi riceve l'avviso e preme "Rispondi" vuole scrivere alla persona
         * che ha preso l'appuntamento, non alla casella di servizio da cui
         * l'avviso è partito e che nessuno legge.
         */
        ...(lead.clientEmail ? { replyTo: lead.clientEmail } : {}),
      });
      esitoAgenzia = String(outcome);
    } else {
      console.warn("[notifications/appointment] Nessun destinatario verificato in agenzia", {
        leadId: lead.id,
        organizationId: lead.organizationId,
      });
    }

    console.info("[EMAIL-APPOINTMENT-SENT]", {
      leadId: lead.id,
      organizationId: lead.organizationId,
      quando: lead.appointmentSlot.toISOString(),
      tipo: tipoAppuntamento(lead),
      cliente: esitoCliente ?? "nessun indirizzo",
      agenzia: esitoAgenzia ?? "nessun destinatario",
    });
  } catch (error) {
    console.error("[notifications/appointment] Conferme non inviate", {
      leadId: lead.id,
      error,
    });
  }
}
