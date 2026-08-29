import "server-only";
import type { Lead } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/listings/property-fields";
import { resolveLeadOwner } from "@/lib/email/recipients";
import { sendMatchFoundEmail } from "@/lib/email/transactional";
import type { MatchingRunResult } from "@/lib/matching/run-matching";

/**
 * Avviso all'agente quando un lead trova immobili compatibili.
 *
 * # Perché una sola email e non una per abbinamento
 *
 * Un lead qualificato può corrispondere a cinque immobili nello stesso
 * istante. Cinque email separate per un solo evento sono la ricetta perché
 * l'agente le archivi tutte senza aprirne nessuna: l'elenco sta dentro un
 * messaggio unico, ordinato per punteggio.
 *
 * # Solo i nuovi
 *
 * `newHighScore` contiene gli abbinamenti creati in questa esecuzione. Un
 * ricalcolo — l'agente ritocca il prezzo, il lead aggiorna la zona — non deve
 * riproporre come novità qualcosa che era già in scheda ieri.
 *
 * Non lancia mai: è un effetto collaterale di una qualificazione già riuscita.
 */
export async function notifyMatchesForLead(
  lead: Lead,
  result: MatchingRunResult
): Promise<void> {
  if (result.newHighScore.length === 0) return;

  try {
    const destinatario = await resolveLeadOwner(lead.organizationId, lead.assignedToId);
    if (!destinatario) return;

    const immobili = await prisma.property.findMany({
      // organizationId anche qui: gli id arrivano dal motore di matching, ma
      // una query che non filtra sull'agenzia è una query che prima o poi
      // qualcuno riusa altrove senza accorgersene (CLAUDE.md §5).
      where: {
        id: { in: result.newHighScore.map((m) => m.propertyId) },
        organizationId: lead.organizationId,
      },
      select: { id: true, reference: true, title: true, priceEur: true },
    });

    const perId = new Map(immobili.map((p) => [p.id, p]));

    const righe = result.newHighScore
      .map((match) => {
        const property = perId.get(match.propertyId);
        return property
          ? {
              reference: property.reference,
              title: property.title,
              price: formatPrice(property.priceEur),
              score: match.score,
            }
          : null;
      })
      .filter((riga): riga is NonNullable<typeof riga> => riga !== null)
      // Il più compatibile per primo: è quello da proporre per primo al
      // telefono.
      .sort((a, b) => b.score - a.score);

    if (righe.length === 0) return;

    const outcome = await sendMatchFoundEmail({
      to: destinatario.email,
      firstName: destinatario.firstName,
      clientName: lead.clientName,
      leadId: lead.id,
      properties: righe,
    });

    console.info("[MATCH-NOTIFY]", {
      leadId: lead.id,
      organizationId: lead.organizationId,
      immobili: righe.length,
      outcome,
    });
  } catch (error) {
    console.error("[notifications/match-found] Avviso non inviato", {
      leadId: lead.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}
