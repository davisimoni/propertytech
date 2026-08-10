import type { SellerCategory } from "@prisma/client";

/**
 * Lead Intelligence — portafoglio immobili del contatto (Modulo 1).
 *
 * Modulo puro e client-safe (niente `server-only`): le stesse regole servono
 * al server che scrive i campi e alla GUI che li mostra. Se la derivazione
 * vivesse in due punti, badge e database finirebbero per raccontare cose
 * diverse allo stesso agente.
 */

/** Da quanti immobili in su un contatto è considerato multi-proprietario. */
export const MULTI_OWNER_THRESHOLD = 2;

/** Tetto difensivo sul conteggio: oltre è quasi certamente un errore di battitura. */
export const MAX_OWNED_PROPERTIES = 99;

export const SELLER_CATEGORY_LABELS: Record<SellerCategory, string> = {
  BUYER_ONLY: "Acquirente Puro",
  SINGLE_SELLER: "Venditore Singolo",
  MULTI_OWNER: "Investitore / Multi-Proprietario",
};

/** Classi del badge di categoria, coerenti con i colori di stato del Modulo 1. */
export const SELLER_CATEGORY_BADGE_CLASSES: Record<SellerCategory, string> = {
  BUYER_ONLY: "bg-muted text-muted-foreground",
  SINGLE_SELLER: "bg-primary/10 text-primary",
  MULTI_OWNER: "bg-status-pending/10 text-status-pending",
};

/**
 * Categoria commerciale a partire dal numero di immobili posseduti.
 * `null` in ingresso significa "non ancora rilevato": non si classifica un
 * contatto di cui non si sa nulla.
 */
export function deriveSellerCategory(count: number | null): SellerCategory | null {
  if (count === null) return null;
  if (count >= MULTI_OWNER_THRESHOLD) return "MULTI_OWNER";
  return count >= 1 ? "SINGLE_SELLER" : "BUYER_ONLY";
}

/** Lead Oro: possiede più di un immobile, quindi vale una chiamata prioritaria. */
export function isGoldLead(count: number | null): boolean {
  return count !== null && count >= MULTI_OWNER_THRESHOLD;
}

/** Etichetta leggibile del conteggio, con il singolare/plurale corretto. */
export function formatOwnedProperties(count: number | null): string {
  if (count === null) return "Non ancora rilevato";
  if (count === 0) return "Nessun immobile da vendere";
  return `${count} immobil${count === 1 ? "e" : "i"}`;
}

/**
 * Deduce il portafoglio da ciò che la qualificazione ha GIÀ raccolto.
 *
 * Non introduce domande nuove: `mustSellFirst` è una delle 3 variabili che il
 * Modulo 1 estrae da sempre. Chi dichiara di dover vendere per comprare
 * possiede almeno un immobile; chi dichiara di non doverlo fare non ha nulla
 * da affidare in vendita all'agenzia.
 */
export function detectedCountFromQualification(mustSellFirst: boolean | null): number | null {
  if (mustSellFirst === null) return null;
  return mustSellFirst ? 1 : 0;
}

/**
 * Unisce un conteggio già noto con uno appena rilevato.
 *
 * Il valore dedotto dalla conversazione è un minimo, mai un massimo: sapere che
 * il cliente deve vendere "un" immobile non smentisce un agente che ne ha
 * registrati tre a mano. Per questo si tiene il maggiore dei due e la
 * derivazione automatica non abbassa mai un dato inserito dall'agente.
 */
export function reconcileOwnedPropertiesCount(
  current: number | null,
  detected: number | null
): number | null {
  if (detected === null) return current;
  if (current === null) return detected;
  return Math.max(current, detected);
}

/** Numero di immobili posseduti da mostrare nel badge compatto della lista lead. */
export function portfolioBadgeLabel(count: number | null): string | null {
  return count !== null && count >= 1 ? `x${count}` : null;
}
