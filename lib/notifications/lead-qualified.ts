import "server-only";
import type { Lead, PortalSource } from "@prisma/client";
import { resolveLeadOwner } from "@/lib/email/recipients";
import { sendLeadQualifiedEmail } from "@/lib/email/transactional";
import { PROPERTY_TYPE_LABELS } from "@/lib/listings/property-fields";
import { pushLeadQualificato } from "@/lib/push/messages";
import { inviaPushAUtenti } from "@/lib/push/send";

/**
 * Lead portato a "Qualificato" dall'assistente IA: email e notifica push.
 *
 * # Solo questo stato
 *
 * È l'unico passaggio della pipeline che genera una notifica. È il momento in
 * cui il contatto va richiamato: le informazioni ci sono e l'interesse è al
 * massimo. Gli altri passaggi (visita, proposta, chiusura) li fa l'agente, che
 * sa già che sono avvenuti.
 *
 * Chiamata sulla TRANSIZIONE (`lib/whatsapp/conversation.ts`), non sullo
 * stato: i messaggi successivi di una conversazione già qualificata non
 * rispediscono nulla.
 *
 * # Destinatario
 *
 * L'agente assegnato, se ha un accesso attivo; altrimenti il titolare.
 *
 * Non lancia mai: la conversazione è già riuscita.
 */

export const ETICHETTA_FONTE: Record<PortalSource, string> = {
  IMMOBILIARE_IT: "Immobiliare.it",
  IDEALISTA: "Idealista",
  CASA_IT: "Casa.it",
  SITO_WEB: "Sito web",
  QR_CODE: "QR in vetrina o su cartello",
  IMPORT: "Importazione da file",
};

const EURO = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 });

function siNo(valore: boolean | null): string | null {
  return valore === null ? null : valore ? "Sì" : "No";
}

function budget(lead: Lead): string | null {
  if (lead.budgetMin && lead.budgetMax) return `${EURO.format(lead.budgetMin)} – ${EURO.format(lead.budgetMax)} €`;
  if (lead.budgetMax) return `fino a ${EURO.format(lead.budgetMax)} €`;
  if (lead.budgetMin) return `da ${EURO.format(lead.budgetMin)} €`;
  return lead.budget?.trim() || null;
}

/**
 * Note di qualificazione emerse dalla conversazione, solo quelle note.
 *
 * Una riga "non dichiarato" per ogni campo vuoto allungherebbe l'email senza
 * dire nulla: meglio sei righe vere che dodici di cui metà vuote. Per chi
 * vende e chi compra i campi sono diversi, e un contatto "ENTRAMBI" li ha
 * tutti e due.
 */
export function noteQualificazione(lead: Lead): { label: string; value: string }[] {
  const note: { label: string; value: string | null }[] = [];
  const vende = lead.intent === "VENDITA" || lead.intent === "ENTRAMBI";
  const compra = lead.intent !== "VENDITA";

  if (lead.intent) {
    note.push({
      label: "Esigenza",
      value: lead.intent === "ACQUISTO" ? "Acquisto" : lead.intent === "VENDITA" ? "Vendita" : "Vendita e acquisto",
    });
  }

  if (compra) {
    note.push(
      { label: "Zona di ricerca", value: lead.preferredZone?.trim() || null },
      { label: "Tipologia cercata", value: lead.preferredType ? PROPERTY_TYPE_LABELS[lead.preferredType] : null },
      { label: "Budget", value: budget(lead) },
      { label: "Superficie minima", value: lead.minSquareMeters ? `${lead.minSquareMeters} mq` : null },
      { label: "Mutuo o liquidità disponibile", value: siNo(lead.mortgageApproved) },
      { label: "Deve vendere prima di acquistare", value: siNo(lead.mustSellFirst) },
      { label: "Tempistiche di acquisto", value: lead.timeframe?.trim() || null }
    );
  }

  if (vende) {
    const ubicazione = [lead.sellerPropertyComune, lead.sellerPropertyZona].filter(Boolean).join(", ");
    note.push(
      { label: "Immobile da vendere", value: ubicazione || null },
      { label: "Tipologia", value: lead.sellerPropertyType ? PROPERTY_TYPE_LABELS[lead.sellerPropertyType] : null },
      { label: "Superficie", value: lead.sellerPropertySquareMeters ? `${lead.sellerPropertySquareMeters} mq circa` : null },
      { label: "Stato dell'immobile", value: lead.sellerPropertyCondition?.trim() || null },
      { label: "Tempistiche di vendita", value: lead.sellerTimeframe?.trim() || null },
      { label: "Interesse per una valutazione", value: siNo(lead.sellerValuationInterest) }
    );
  }

  return note.filter((nota): nota is { label: string; value: string } => Boolean(nota.value));
}

export async function notifyLeadQualified(lead: Lead): Promise<void> {
  try {
    const destinatario = await resolveLeadOwner(lead.organizationId, lead.assignedToId);
    if (!destinatario) {
      console.warn("[notifications/lead-qualified] Nessun destinatario verificato", {
        leadId: lead.id,
        organizationId: lead.organizationId,
      });
      return;
    }

    // In parallelo: sono canali indipendenti, e la push è quella che deve
    // arrivare subito.
    const [email, push] = await Promise.all([
      sendLeadQualifiedEmail({
        to: destinatario.email,
        firstName: destinatario.firstName,
        leadId: lead.id,
        clientName: lead.clientName,
        clientPhone: lead.clientPhone,
        fonte: ETICHETTA_FONTE[lead.portalSource],
        immobile: lead.propertyRef,
        note: noteQualificazione(lead),
      }),
      inviaPushAUtenti([destinatario.id], pushLeadQualificato(lead)),
    ]);

    console.info("[LEAD-QUALIFIED-NOTIFY]", {
      leadId: lead.id,
      organizationId: lead.organizationId,
      assegnato: Boolean(lead.assignedToId),
      email,
      push: push.inviate,
    });
  } catch (error) {
    console.error("[notifications/lead-qualified] Notifica non inviata", {
      leadId: lead.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}
