import "server-only";
import type { Lead } from "@prisma/client";
import { resolveLeadOwner } from "@/lib/email/recipients";
import { sendLeadAttentionRequiredEmail } from "@/lib/email/transactional";

/**
 * Avviso quando la qualificazione si blocca e serve una persona.
 *
 * Scatta sul messaggio di ripiego: l'assistente non è riuscito a elaborare la
 * risposta del cliente e gli ha detto che verrà ricontattato da un agente. Da
 * quel momento c'è una promessa fatta a un cliente, e senza questo avviso
 * nessuno in agenzia sa di doverla mantenere.
 *
 * Non lancia mai: è un effetto collaterale di una conversazione già gestita.
 */
export async function notifyLeadNeedsAttention(lead: Lead): Promise<void> {
  try {
    const destinatario = await resolveLeadOwner(lead.organizationId, lead.assignedToId);
    if (!destinatario) return;

    const outcome = await sendLeadAttentionRequiredEmail({
      to: destinatario.email,
      firstName: destinatario.firstName,
      clientName: lead.clientName,
      clientPhone: lead.clientPhone,
      leadId: lead.id,
    });

    console.info("[LEAD-ATTENTION-NOTIFY]", {
      leadId: lead.id,
      organizationId: lead.organizationId,
      outcome,
    });
  } catch (error) {
    console.error("[notifications/lead-attention] Avviso non inviato", {
      leadId: lead.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}
