import type { LeadView } from "./view-types";

/**
 * Punteggio di priorità del Modulo 1 — Lead Intelligence.
 *
 * Modulo puro e client-safe (niente `server-only`, stesso principio di
 * `portfolio.ts`): le stesse regole servono a chi legge la pipeline e a
 * chiunque in futuro le consumi lato server (export, ordinamento). Il
 * punteggio si ricava SOLO da dati che la qualificazione ha già raccolto —
 * mutuo, portafoglio, budget, zona, appuntamento — mai da un giudizio del
 * modello: un agente deve poter vedere esattamente perché un contatto pesa
 * più di un altro, non fidarsi di un numero opaco.
 */

export type LeadPriority = "ALTA" | "MEDIA" | "BASSA";

export const LEAD_PRIORITY_LABELS: Record<LeadPriority, string> = {
  ALTA: "Priorità alta",
  MEDIA: "Priorità media",
  BASSA: "Priorità bassa",
};

export const LEAD_PRIORITY_CLASSES: Record<LeadPriority, string> = {
  ALTA: "bg-status-qualified/10 text-status-qualified",
  MEDIA: "bg-status-pending/10 text-status-pending",
  BASSA: "bg-muted text-muted-foreground",
};

type PriorityInput = Pick<
  LeadView,
  | "qualificationStatus"
  | "mortgageApproved"
  | "sellerCategory"
  | "budget"
  | "budgetMin"
  | "budgetMax"
  | "preferredZone"
  | "appointmentSlot"
  | "appointmentConfirmed"
>;

/**
 * Pesi del punteggio, dichiarati qui e non sparsi nel calcolo: chi legge
 * `LEAD_SCORE_REASONS` deve trovarci gli stessi numeri che la funzione usa.
 */
const WEIGHTS = {
  qualified: 15,
  mortgageApproved: 30,
  multiOwner: 30,
  singleSeller: 15,
  budgetDeclared: 10,
  zoneDeclared: 5,
  appointmentBooked: 10,
  appointmentConfirmed: 10,
} as const;

/** Punteggio 0-100. Somma di segnali indipendenti, capata al tetto per la lettura in badge. */
export function computeLeadScore(lead: PriorityInput): number {
  let score = 0;

  if (lead.qualificationStatus === "QUALIFIED") score += WEIGHTS.qualified;

  // Il segnale più forte: un acquirente con copertura finanziaria è pronto a
  // muoversi, uno senza non lo è a prescindere da tutto il resto.
  if (lead.mortgageApproved === true) score += WEIGHTS.mortgageApproved;

  if (lead.sellerCategory === "MULTI_OWNER") score += WEIGHTS.multiOwner;
  else if (lead.sellerCategory === "SINGLE_SELLER") score += WEIGHTS.singleSeller;

  if (lead.budget !== null || lead.budgetMin !== null || lead.budgetMax !== null) {
    score += WEIGHTS.budgetDeclared;
  }
  if (lead.preferredZone !== null) score += WEIGHTS.zoneDeclared;

  if (lead.appointmentSlot !== null) score += WEIGHTS.appointmentBooked;
  if (lead.appointmentConfirmed === true) score += WEIGHTS.appointmentConfirmed;

  return Math.min(score, 100);
}

/**
 * `null` per un punteggio a zero: un lead appena arrivato, senza ancora
 * nessun dato raccolto, non è "a bassa priorità" — è solo troppo presto per
 * dirlo, e un badge in quel caso direbbe più di quanto sappiamo davvero.
 */
export function deriveLeadPriority(score: number): LeadPriority | null {
  if (score <= 0) return null;
  if (score >= 50) return "ALTA";
  if (score >= 20) return "MEDIA";
  return "BASSA";
}

/** I fattori che hanno contribuito, in ordine di peso: il testo del tooltip del badge. */
export function leadScoreReasons(lead: PriorityInput): string[] {
  const reasons: string[] = [];
  if (lead.mortgageApproved === true) reasons.push("mutuo o liquidità confermati");
  if (lead.sellerCategory === "MULTI_OWNER") reasons.push("multi-proprietario (lead oro)");
  else if (lead.sellerCategory === "SINGLE_SELLER") reasons.push("ha un immobile da vendere");
  if (lead.qualificationStatus === "QUALIFIED") reasons.push("qualificato dal bot");
  if (lead.appointmentSlot !== null) reasons.push("appuntamento fissato");
  if (lead.appointmentConfirmed === true) reasons.push("appuntamento confermato");
  if (lead.budget !== null || lead.budgetMin !== null || lead.budgetMax !== null) {
    reasons.push("budget dichiarato");
  }
  if (lead.preferredZone !== null) reasons.push("zona dichiarata");
  return reasons;
}
