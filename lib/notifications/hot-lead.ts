import "server-only";
import type { Lead } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/seo";
import { sendEmail } from "./email";
import { resolveLeadOwner } from "@/lib/email/recipients";

/**
 * Avviso all'agente quando un lead diventa caldo.
 *
 * Il momento conta più del contenuto: un acquirente con mutuo deliberato che
 * ha appena detto "entro tre mesi" è il lead che si chiude richiamandolo
 * subito, e senza questo avviso l'agenzia lo scopre quando riapre la
 * piattaforma — cioè quando quel contatto ha già sentito altri due.
 */

function buildBody(lead: Lead, recipientName: string): string {
  const righe = [
    recipientName ? `Ciao ${recipientName},` : "Ciao,",
    "",
    `${lead.clientName} ha completato la qualificazione su WhatsApp ed è un contatto caldo.`,
    "",
    `Nome:       ${lead.clientName}`,
    `Telefono:   ${lead.clientPhone}`,
    `Budget:     ${lead.budget ?? "non dichiarato"}`,
    `Zona:       ${lead.preferredZone ?? "non indicata"}`,
    `Tempistica: ${lead.timeframe ?? "non indicata"}`,
    `Mutuo/liquidità: ${lead.mortgageApproved === null ? "non emerso" : lead.mortgageApproved ? "sì" : "no"}`,
    `Immobile:   ${lead.propertyRef}`,
    "",
    // Alla lista con la scheda aperta: `?lead=` è letto da /leads per aprire
    // subito il cassetto giusto, invece di far cercare il nome in tabella.
    `Apri la scheda: ${SITE_URL}/leads?lead=${lead.id}`,
    "",
    "— PropertyTech",
  ];

  return righe.join("\n");
}

/**
 * Invia l'avviso di lead caldo. Non lancia mai.
 *
 * Come `deliverLeadToCrm`: è un effetto collaterale di una conversazione già
 * riuscita e pagata a credito, e un guasto qui non deve far fallire nulla a
 * monte.
 */
export async function notifyHotLead(lead: Lead): Promise<void> {
  try {
    // Destinatario risolto dal modulo condiviso: le regole su chi puo'
    // ricevere dati dell'agenzia stanno in un posto solo.
    const recipient = await resolveLeadOwner(lead.organizationId, lead.assignedToId);

    if (!recipient) {
      console.warn("[notifications/hot-lead] Nessun destinatario verificato", {
        leadId: lead.id,
        organizationId: lead.organizationId,
      });
      return;
    }

    const outcome = await sendEmail({
      to: recipient.email,
      subject: `🔥 Lead qualificato: ${lead.clientName}`,
      text: buildBody(lead, recipient.firstName ?? ""),
    });

    console.info("[HOT-LEAD-NOTIFY]", {
      leadId: lead.id,
      organizationId: lead.organizationId,
      assegnato: Boolean(lead.assignedToId),
      outcome,
    });
  } catch (error) {
    console.error("[notifications/hot-lead] Avviso non inviato", { leadId: lead.id, error });
  }
}
