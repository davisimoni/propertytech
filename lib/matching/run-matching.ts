import "server-only";
import type { Property } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { scorePropertyForLead } from "./smart-match";

/**
 * Persistenza dello Smart Matching.
 *
 * Gira quando un immobile entra in portafoglio o viene modificato. È
 * un'operazione accessoria: un errore qui non deve mai far fallire il
 * salvataggio dell'immobile, che è ciò che l'agente stava facendo.
 */

/** Tetto alla scansione: una singola esecuzione non legge anni di storico. */
const MAX_LEADS_SCANNED = 2000;

export interface MatchingRunResult {
  evaluated: number;
  matched: number;
}

/**
 * Confronta un immobile con i lead qualificati dell'agenzia e salva gli
 * accoppiamenti sopra soglia.
 *
 * Si considerano solo i lead `QUALIFIED`: proporre un immobile a chi non ha
 * ancora superato la qualificazione — o peggio, a chi ha revocato il consenso
 * — manderebbe l'agente a chiamare la persona sbagliata.
 */
export async function runMatchingForProperty(property: Property): Promise<MatchingRunResult> {
  // organizationId nel filtro: nessun immobile può essere confrontato con i
  // lead di un'altra agenzia (CLAUDE.md §5).
  const leads = await prisma.lead.findMany({
    where: {
      organizationId: property.organizationId,
      qualificationStatus: "QUALIFIED",
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_LEADS_SCANNED,
    select: {
      id: true,
      preferredZone: true,
      preferredType: true,
      budgetMin: true,
      budgetMax: true,
      minSquareMeters: true,
    },
  });

  let matched = 0;

  for (const lead of leads) {
    const result = scorePropertyForLead(property, lead);

    if (!result.isMatch) {
      // Un accoppiamento che non regge più va rimosso, altrimenti resterebbe
      // in scheda dopo una modifica di prezzo che lo ha invalidato.
      await prisma.propertyLeadMatch.deleteMany({
        where: { propertyId: property.id, leadId: lead.id },
      });
      continue;
    }

    // upsert sul vincolo unico: ricalcolare aggiorna il punteggio invece di
    // accumulare duplicati a ogni salvataggio dell'immobile.
    await prisma.propertyLeadMatch.upsert({
      where: { propertyId_leadId: { propertyId: property.id, leadId: lead.id } },
      create: {
        propertyId: property.id,
        leadId: lead.id,
        organizationId: property.organizationId,
        score: result.score,
        reasons: result.reasons,
      },
      update: { score: result.score, reasons: result.reasons },
    });

    matched++;
  }

  return { evaluated: leads.length, matched };
}
