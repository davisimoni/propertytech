import type { PropertyType } from "@prisma/client";

/**
 * Smart Matching: quanto un immobile in portafoglio somiglia a ciò che un lead
 * sta cercando.
 *
 * Modulo puro — nessun accesso al database — così la regola commerciale è
 * leggibile e verificabile in isolamento. La persistenza vive in
 * `lib/matching/run-matching.ts`.
 *
 * Principio di fondo: **il silenzio non è un consenso**. Un criterio non
 * dichiarato dal lead non produce punti, né positivi né negativi. Un lead di
 * cui non si sa nulla non finisce fra i "Match Perfetti" di ogni immobile
 * caricato, che renderebbe la funzione rumore da ignorare entro una settimana.
 */

/** Punteggio minimo per proporre l'accoppiamento all'agente. */
export const MATCH_THRESHOLD = 50;

/** Da qui in su l'accoppiamento è un "Match Perfetto". */
export const PERFECT_MATCH_THRESHOLD = 80;

export interface MatchablePropertyInput {
  comune: string;
  zona?: string | null;
  type: PropertyType;
  priceEur: number;
  squareMeters: number;
}

export interface MatchableLeadInput {
  preferredZone?: string | null;
  preferredType?: PropertyType | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  minSquareMeters?: number | null;
}

export interface MatchResult {
  /** 0-100. */
  score: number;
  /** Motivi leggibili, mostrati all'agente accanto al punteggio. */
  reasons: string[];
  /** `false` quando un criterio dichiarato è violato: l'accoppiamento non si propone. */
  isMatch: boolean;
}

/** Confronto di zone tollerante ad accenti, maiuscole e punteggiatura. */
function normalizePlace(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * La zona cercata dal lead compare fra comune e quartiere dell'immobile?
 *
 * Il confronto è per contenimento in entrambe le direzioni: un lead che scrive
 * "Navigli" deve agganciare un immobile in zona "Navigli / Porta Genova", e un
 * lead che scrive "Milano Navigli" deve agganciare il comune "Milano".
 */
function placeMatches(wanted: string, comune: string, zona?: string | null): boolean {
  const target = normalizePlace(wanted);
  if (!target) return false;

  return [comune, zona ?? ""]
    .map(normalizePlace)
    .filter(Boolean)
    .some((candidate) => candidate.includes(target) || target.includes(candidate));
}

/**
 * Calcola la compatibilità fra un immobile e le preferenze di un lead.
 *
 * I pesi riflettono cosa fa davvero saltare una trattativa: il budget è il
 * primo motivo per cui una visita non si trasforma in proposta, la zona il
 * secondo. Superficie e tipologia contano, ma su quelle un acquirente
 * scende a compromessi molto più spesso.
 */
export function scorePropertyForLead(
  property: MatchablePropertyInput,
  lead: MatchableLeadInput
): MatchResult {
  const reasons: string[] = [];
  let earned = 0;
  let available = 0;

  // --- Budget (peso 40) ---
  // Solo il massimo pesa sul punteggio: è il tetto oltre il quale la
  // trattativa non parte. Il minimo è una soglia di esclusione, non un
  // criterio da premiare, e viene verificato subito dopo.
  const { budgetMin, budgetMax } = lead;

  if (budgetMax !== null && budgetMax !== undefined) {
    available += 40;

    if (property.priceEur <= budgetMax) {
      earned += 40;
      reasons.push(`Prezzo entro il budget dichiarato`);
    } else if (property.priceEur <= budgetMax * 1.1) {
      // Il 10% sopra soglia resta trattabile: è il margine su cui si negozia.
      earned += 20;
      reasons.push("Prezzo poco sopra il budget, trattabile");
    } else {
      return {
        score: 0,
        reasons: ["Prezzo fuori budget"],
        isMatch: false,
      };
    }
  }

  if (
    budgetMin !== null &&
    budgetMin !== undefined &&
    property.priceEur < budgetMin
  ) {
    // Sotto il minimo dichiarato: di solito significa un immobile di categoria
    // diversa da quella cercata, non un affare.
    return { score: 0, reasons: ["Prezzo sotto la soglia minima indicata"], isMatch: false };
  }

  // --- Zona (peso 30) ---
  if (lead.preferredZone?.trim()) {
    available += 30;

    if (placeMatches(lead.preferredZone, property.comune, property.zona)) {
      earned += 30;
      reasons.push(`Zona richiesta: ${lead.preferredZone.trim()}`);
    } else {
      return { score: 0, reasons: ["Zona diversa da quella richiesta"], isMatch: false };
    }
  }

  // --- Tipologia (peso 20) ---
  if (lead.preferredType) {
    available += 20;

    if (lead.preferredType === property.type) {
      earned += 20;
      reasons.push("Tipologia corrispondente");
    }
    // Tipologia diversa non squalifica: chi cerca un appartamento guarda
    // volentieri un attico.
  }

  // --- Superficie (peso 10) ---
  if (lead.minSquareMeters !== null && lead.minSquareMeters !== undefined) {
    available += 10;

    if (property.squareMeters >= lead.minSquareMeters) {
      earned += 10;
      reasons.push(`Almeno ${lead.minSquareMeters} mq richiesti`);
    }
  }

  // Nessun criterio dichiarato: non si inventa un match.
  if (available === 0) {
    return { score: 0, reasons: [], isMatch: false };
  }

  const score = Math.round((earned / available) * 100);

  return {
    score,
    reasons,
    isMatch: score >= MATCH_THRESHOLD,
  };
}

/** Etichetta del punteggio per la UI. */
export function matchLabel(score: number): string {
  if (score >= PERFECT_MATCH_THRESHOLD) return "Match Perfetto";
  if (score >= MATCH_THRESHOLD) return "Compatibile";
  return "Poco compatibile";
}
