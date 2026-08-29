import "server-only";
import type { Lead, Property } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPublishable } from "@/lib/listings/mandate";
import { scorePropertyForLead } from "./smart-match";

/**
 * Persistenza dello Smart Matching, nelle due direzioni.
 *
 * # Perché una funzione sola
 *
 * Prima esisteva solo `runMatchingForProperty`, invocata al salvataggio di un
 * immobile. Mancava il verso opposto, e la conseguenza era concreta:
 * un'agenzia con cinquanta immobili a catalogo che qualificava l'acquirente
 * perfetto **otteneva zero abbinamenti**, e continuava a ottenerne zero finché
 * non caricava un immobile nuovo. Il caso d'uso più frequente era quello
 * scoperto.
 *
 * Le due direzioni condividono lo stesso punteggio e la stessa scrittura:
 * duplicarle avrebbe prodotto, alla prima modifica del criterio, due risposte
 * diverse alla stessa domanda.
 *
 * # Sempre accessorio
 *
 * Un errore qui non deve mai far fallire ciò che l'agente stava facendo:
 * salvare un immobile, o qualificare un lead.
 */

/** Tetto alla scansione: una singola esecuzione non legge anni di storico. */
const MAX_SCANNED = 2000;

/** Sopra questa soglia l'abbinamento merita un avviso, non solo una riga in scheda. */
export const NOTIFY_SCORE_THRESHOLD = 80;

export interface MatchingRunResult {
  evaluated: number;
  matched: number;
  /** Abbinamenti sopra soglia creati **adesso**: sono quelli da annunciare. */
  newHighScore: { propertyId: string; leadId: string; score: number }[];
}

const EMPTY: MatchingRunResult = { evaluated: 0, matched: 0, newHighScore: [] };

/** Criteri di ricerca del lead: gli unici campi che il punteggio consulta. */
const LEAD_CRITERIA = {
  id: true,
  preferredZone: true,
  preferredType: true,
  budgetMin: true,
  budgetMax: true,
  minSquareMeters: true,
} as const;

type LeadCriteria = Parameters<typeof scorePropertyForLead>[1] & { id: string };

/**
 * Applica un singolo confronto e ne persiste l'esito.
 *
 * Restituisce `matched` per il conteggio e `isNew` per distinguere un
 * abbinamento appena nato da uno ricalcolato: è ciò che permette di annunciare
 * solo le novità, invece di riproporre a ogni salvataggio abbinamenti che
 * l'agente ha già visto.
 */
async function applyMatch(
  property: Property,
  lead: LeadCriteria
): Promise<{ matched: boolean; isNew: boolean; score: number }> {
  const result = scorePropertyForLead(property, lead);

  if (!result.isMatch) {
    // Un accoppiamento che non regge più va rimosso, altrimenti resterebbe in
    // scheda dopo una modifica di prezzo che lo ha invalidato.
    await prisma.propertyLeadMatch.deleteMany({
      where: { propertyId: property.id, leadId: lead.id },
    });
    return { matched: false, isNew: false, score: result.score };
  }

  const esistente = await prisma.propertyLeadMatch.findUnique({
    where: { propertyId_leadId: { propertyId: property.id, leadId: lead.id } },
    select: { id: true },
  });

  // upsert sul vincolo unico: ricalcolare aggiorna il punteggio invece di
  // accumulare duplicati a ogni salvataggio.
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

  return { matched: true, isNew: !esistente, score: result.score };
}

function collect(
  esito: { matched: boolean; isNew: boolean; score: number },
  propertyId: string,
  leadId: string,
  out: MatchingRunResult
): void {
  if (!esito.matched) return;
  out.matched++;
  if (esito.isNew && esito.score >= NOTIFY_SCORE_THRESHOLD) {
    out.newHighScore.push({ propertyId, leadId, score: esito.score });
  }
}

/**
 * Un immobile contro i lead qualificati dell'agenzia.
 *
 * Solo lead `QUALIFIED`: proporre un immobile a chi non ha superato la
 * qualificazione — o peggio, a chi ha revocato il consenso — manderebbe
 * l'agente a chiamare la persona sbagliata.
 */
export async function runMatchingForProperty(property: Property): Promise<MatchingRunResult> {
  // organizationId nel filtro: nessun immobile può essere confrontato con i
  // lead di un'altra agenzia (CLAUDE.md §5).
  const leads = await prisma.lead.findMany({
    where: { organizationId: property.organizationId, qualificationStatus: "QUALIFIED" },
    orderBy: { updatedAt: "desc" },
    take: MAX_SCANNED,
    select: LEAD_CRITERIA,
  });

  const out: MatchingRunResult = { evaluated: leads.length, matched: 0, newHighScore: [] };

  for (const lead of leads) {
    collect(await applyMatch(property, lead), property.id, lead.id, out);
  }

  return out;
}

/**
 * Un lead contro il portafoglio dell'agenzia.
 *
 * Si confrontano solo gli immobili **pubblicabili**: uno venduto, una bozza o
 * uno con l'incarico scaduto non si può proporre, e farlo comparire fra i
 * suggerimenti manderebbe l'agente a offrire qualcosa che non ha più titolo
 * per vendere.
 */
export async function runMatchingForLead(lead: Lead): Promise<MatchingRunResult> {
  // Prima della qualificazione i criteri di ricerca sono incompleti, e
  // produrrebbero abbinamenti costruiti sul nulla.
  if (lead.qualificationStatus !== "QUALIFIED") return { ...EMPTY, newHighScore: [] };

  const properties = await prisma.property.findMany({
    where: { organizationId: lead.organizationId },
    orderBy: { createdAt: "desc" },
    take: MAX_SCANNED,
  });

  const now = new Date();
  const pubblicabili = properties.filter((property) => isPublishable(property, now));

  const out: MatchingRunResult = { evaluated: pubblicabili.length, matched: 0, newHighScore: [] };

  for (const property of pubblicabili) {
    collect(await applyMatch(property, lead), property.id, lead.id, out);
  }

  return out;
}

/**
 * Punto d'ingresso unico, per chi ha un id e non l'entità.
 *
 * Accetta l'uno o l'altro: passarli entrambi non ha significato — sarebbe il
 * confronto di una coppia sola — e viene rifiutato invece di scegliere in
 * silenzio quale dei due usare.
 */
export async function runBidirectionalMatching(params: {
  leadId?: string;
  propertyId?: string;
}): Promise<MatchingRunResult> {
  if (Boolean(params.leadId) === Boolean(params.propertyId)) {
    console.warn("[matching] Invocazione ambigua: serve esattamente uno fra leadId e propertyId");
    return { ...EMPTY, newHighScore: [] };
  }

  try {
    if (params.leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: params.leadId } });
      return lead ? await runMatchingForLead(lead) : { ...EMPTY, newHighScore: [] };
    }

    const property = await prisma.property.findUnique({ where: { id: params.propertyId } });
    return property ? await runMatchingForProperty(property) : { ...EMPTY, newHighScore: [] };
  } catch (error) {
    console.error("[matching] Esecuzione non riuscita", {
      ...params,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return { ...EMPTY, newHighScore: [] };
  }
}
