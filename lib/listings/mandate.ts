import type { ListingType, PropertyStatus } from "@prisma/client";
import { PUBLISHED_STATUSES } from "./property-fields";

/**
 * Incarico di mediazione: etichette e regole di pubblicabilità.
 *
 * Modulo puro, condiviso fra il feed XML, la scheda immobile e il controllo
 * pianificato delle scadenze. La regola su "questo immobile si può
 * pubblicizzare?" deve dare la stessa risposta nei tre posti, e l'unico modo
 * di garantirlo è che sia scritta una volta.
 */

export const LISTING_TYPE_LABELS: Record<ListingType, string> = {
  ESCLUSIVA: "Incarico in esclusiva",
  NON_ESCLUSIVA: "Incarico non esclusivo",
  SELEZIONE: "Selezione",
};

/** Descrizione di cosa comporta, mostrata sotto al selettore. */
export const LISTING_TYPE_HINTS: Record<ListingType, string> = {
  ESCLUSIVA: "Solo la tua agenzia tratta questo immobile",
  NON_ESCLUSIVA: "Il proprietario può averlo affidato anche ad altri",
  SELEZIONE: "Puoi presentare acquirenti, non trattare in via esclusiva",
};

/** Soglie di preavviso sulla scadenza dell'incarico. */
export const MANDATE_WARNING_DAYS = [60, 30] as const;

export type MandateStatus = "nessuno" | "valido" | "in_scadenza" | "scaduto";

/**
 * Giorni che mancano alla scadenza, per **giorno di calendario**.
 *
 * Il confronto è fra giorni di calendario e non fra istanti: altrimenti un
 * incarico cambierebbe stato a seconda dell'ora in cui l'agente apre la
 * pagina, e un mandato che scade oggi risulterebbe già scaduto alle 14 e
 * ancora valido alle 9.
 *
 * Il giorno è quello **italiano**, non quello UTC. Le date si salvano a
 * mezzanotte UTC, ma chi legge è un'agenzia in Italia: fra le 00:00 e le 02:00
 * di ora legale il giorno UTC è ancora quello prima, e un incarico in scadenza
 * risulterebbe avere un giorno in più a chi controlla la sera tardi.
 */
const GIORNO_ROMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Il giorno di calendario italiano, come numero confrontabile. */
function giornoItaliano(date: Date): number {
  // `en-CA` produce `YYYY-MM-DD`, che ordina e si converte senza ambiguita'.
  return Date.parse(`${GIORNO_ROMA.format(date)}T00:00:00.000Z`);
}

export function daysUntilExpiry(expiration: Date, now: Date = new Date()): number {
  return Math.round((giornoItaliano(expiration) - giornoItaliano(now)) / 86_400_000);
}

/**
 * Stato dell'incarico.
 *
 * `nessuno` quando la data non è stata inserita, ed è **diverso da scaduto**:
 * un'agenzia può caricare la scheda prima di formalizzare il mandato, e
 * trattarla come scaduta le toglierebbe dai portali immobili perfettamente
 * regolari solo perché un campo facoltativo è vuoto.
 */
export function mandateStatus(
  expiration: Date | null | undefined,
  now: Date = new Date()
): MandateStatus {
  if (!expiration) return "nessuno";

  const giorni = daysUntilExpiry(expiration, now);
  if (giorni < 0) return "scaduto";
  if (giorni <= MANDATE_WARNING_DAYS[0]) return "in_scadenza";
  return "valido";
}

/**
 * Vero quando l'immobile può uscire verso i portali.
 *
 * Due condizioni, entrambe necessarie: lo stato commerciale deve essere fra
 * quelli pubblicabili, e l'incarico non deve essere scaduto.
 *
 * **Un incarico scaduto ferma la pubblicazione anche su un immobile ancora
 * "in vendita"**: senza mandato valido l'agenzia non ha titolo per
 * pubblicizzarlo, e continuare a mandarlo ai portali la espone. Un incarico
 * mai inserito non blocca invece nulla — vedi `mandateStatus`.
 */
export function isPublishable(
  property: { status: PropertyStatus; mandateExpiration: Date | null },
  now: Date = new Date()
): boolean {
  const statoOk = (PUBLISHED_STATUSES as readonly PropertyStatus[]).includes(property.status);
  return statoOk && mandateStatus(property.mandateExpiration, now) !== "scaduto";
}

/** Provvigione leggibile: `3.50` → `3,5%`. */
export function formatCommission(rate: number | null | undefined): string | null {
  if (rate === null || rate === undefined) return null;
  return `${String(rate).replace(/\.?0+$/, "").replace(".", ",")}%`;
}
