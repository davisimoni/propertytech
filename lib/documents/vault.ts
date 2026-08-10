import type { DocumentCategory } from "@prisma/client";

/**
 * Fascicolo documentale: regole di conservazione, scadenze e completezza.
 *
 * Modulo puro, senza accesso al database e senza `server-only`: la stessa
 * logica decide cosa scrivere quando si carica un documento e cosa mostrare
 * nella scheda, e le due cose non devono poter divergere.
 *
 * ATTENZIONE A COSA QUESTO MODULO NON È. Non è uno strumento di conformità
 * antiriciclaggio e non certifica nulla: aiuta l'agenzia a tenere in ordine i
 * documenti e a non farsi scadere un APE. La valutazione del rischio, la
 * segnalazione di operazioni sospette alla UIF e la responsabilità di quanto
 * dichiarato restano in capo al soggetto obbligato (D.Lgs. 231/2007).
 */

/**
 * Anni di conservazione dei documenti dell'incarico.
 *
 * Dieci, come l'art. 31 del D.Lgs. 231/2007 impone ai soggetti obbligati — e
 * gli agenti immobiliari lo sono, per l'art. 3 comma 5 lett. d). Coincide con
 * il termine civilistico decennale delle scritture, quindi è anche il termine
 * più lungo fra quelli applicabili: tenerne uno solo evita di dover spiegare
 * all'agente perché due documenti dello stesso fascicolo scadono in momenti
 * diversi.
 */
export const RETENTION_YEARS = 10;

/**
 * Giorni entro cui una scadenza è considerata imminente.
 *
 * Sessanta e non trenta: rifare un APE o rinnovare una carta d'identità
 * richiede settimane, e un preavviso che arriva quando il rogito è già fissato
 * non serve a niente.
 */
export const EXPIRY_WARNING_DAYS = 60;

/**
 * Tetto del file caricabile, in byte del documento originale.
 *
 * Vincolo di infrastruttura, non di prodotto: senza storage a oggetti il file
 * finisce nel database come data URI, e il database è quello dell'intera
 * applicazione. Cinque megabyte coprono una visura o un APE scansionati;
 * l'archivio di un'agenzia a pieno regime richiede uno storage dedicato in UE.
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** La codifica base64 gonfia di circa un terzo, più il prefisso `data:`. */
export const MAX_FILE_DATA_URL_CHARS = Math.ceil(MAX_FILE_BYTES * 1.4);

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  IDENTITA: "Documento d'identità",
  CODICE_FISCALE: "Codice fiscale / tessera sanitaria",
  VISURA_CATASTALE: "Visura catastale",
  PLANIMETRIA: "Planimetria",
  ATTO_PROVENIENZA: "Atto di provenienza",
  APE: "Attestato di prestazione energetica",
  MANDATO: "Incarico di mediazione",
  PROPOSTA: "Proposta d'acquisto",
  COMPROMESSO: "Preliminare di compravendita",
  CONFORMITA_IMPIANTI: "Conformità impianti",
  ALTRO: "Altro",
};

/** Ordine di comparsa nei menu: segue il percorso reale di un incarico. */
export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  "MANDATO",
  "IDENTITA",
  "CODICE_FISCALE",
  "VISURA_CATASTALE",
  "PLANIMETRIA",
  "ATTO_PROVENIENZA",
  "APE",
  "CONFORMITA_IMPIANTI",
  "PROPOSTA",
  "COMPROMESSO",
  "ALTRO",
];

/**
 * Documenti che hanno una scadenza propria, per cui chiedere la data ha senso.
 *
 * Un atto di provenienza non scade: proporre il campo lo farebbe compilare a
 * caso, e una scadenza inventata è peggio di una scadenza assente.
 */
const EXPIRING_CATEGORIES = new Set<DocumentCategory>([
  "IDENTITA",
  "APE",
  "CONFORMITA_IMPIANTI",
  "MANDATO",
  "PROPOSTA",
]);

export function hasExpiry(category: DocumentCategory): boolean {
  return EXPIRING_CATEGORIES.has(category);
}

/**
 * Documenti attesi nel fascicolo di un immobile in vendita.
 *
 * È l'elenco che rende utile la funzione: non "quali file ho caricato", ma
 * "cosa manca prima di poter andare dal notaio".
 */
export const PROPERTY_CHECKLIST: DocumentCategory[] = [
  "MANDATO",
  "VISURA_CATASTALE",
  "PLANIMETRIA",
  "ATTO_PROVENIENZA",
  "APE",
  "CONFORMITA_IMPIANTI",
];

/** Documenti attesi nel fascicolo di un cliente. */
export const LEAD_CHECKLIST: DocumentCategory[] = ["IDENTITA", "CODICE_FISCALE"];

/**
 * Termine di conservazione a partire dalla data di acquisizione.
 *
 * Calcolato una volta e salvato, non ricavato a ogni lettura: se un domani la
 * durata di legge cambia, i documenti già in archivio devono restare legati al
 * termine vigente quando sono stati acquisiti.
 */
export function computeRetentionUntil(acquiredAt: Date): Date {
  const until = new Date(acquiredAt);
  until.setFullYear(until.getFullYear() + RETENTION_YEARS);
  return until;
}

export type ExpiryState = "none" | "valid" | "expiring" | "expired";

export interface ExpiryInfo {
  state: ExpiryState;
  /** Giorni alla scadenza: negativo se già passata, `null` se non scade. */
  daysLeft: number | null;
  label: string;
}

const MS_PER_DAY = 86_400_000;

/**
 * Stato di scadenza di un documento.
 *
 * `now` è un parametro e non `new Date()` interno: è ciò che rende la funzione
 * verificabile senza aspettare che passi il tempo.
 */
export function expiryInfo(expiresAt: Date | null, now: Date = new Date()): ExpiryInfo {
  if (!expiresAt) {
    return { state: "none", daysLeft: null, label: "Non scade" };
  }

  // Confronto per giorno di calendario, non per istante: un documento che
  // scade oggi non è ancora scaduto, e senza normalizzare lo diventerebbe a
  // seconda dell'ora in cui l'agente apre la pagina.
  const startOfExpiry = Date.UTC(
    expiresAt.getUTCFullYear(),
    expiresAt.getUTCMonth(),
    expiresAt.getUTCDate()
  );
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysLeft = Math.round((startOfExpiry - startOfToday) / MS_PER_DAY);

  if (daysLeft < 0) {
    const days = Math.abs(daysLeft);
    return {
      state: "expired",
      daysLeft,
      label: days === 1 ? "Scaduto ieri" : `Scaduto da ${days} giorni`,
    };
  }

  if (daysLeft === 0) {
    return { state: "expiring", daysLeft, label: "Scade oggi" };
  }

  if (daysLeft <= EXPIRY_WARNING_DAYS) {
    return {
      state: "expiring",
      daysLeft,
      label: daysLeft === 1 ? "Scade domani" : `Scade fra ${daysLeft} giorni`,
    };
  }

  return {
    state: "valid",
    daysLeft,
    label: `Valido fino al ${formatDate(expiresAt)}`,
  };
}

/** Data in formato italiano, come nel resto dell'applicazione. */
export function formatDate(date: Date): string {
  return date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Dimensione file leggibile. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface ChecklistEntry {
  category: DocumentCategory;
  label: string;
  present: boolean;
}

/**
 * Confronto fra i documenti attesi e quelli presenti.
 *
 * Un documento scaduto conta comunque come presente: manca la validità, non il
 * documento, e sono due problemi diversi che l'agente risolve in modi diversi.
 */
export function buildChecklist(
  expected: DocumentCategory[],
  present: DocumentCategory[]
): ChecklistEntry[] {
  const owned = new Set(present);
  return expected.map((category) => ({
    category,
    label: DOCUMENT_CATEGORY_LABELS[category],
    present: owned.has(category),
  }));
}

/** Estensione consentite: documenti e scansioni, niente eseguibili. */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/**
 * Verifica che il data URI dichiari un tipo consentito.
 *
 * Il tipo arriva dal browser e non è una garanzia sul contenuto: qui serve a
 * evitare che un file venga archiviato e poi restituito con un tipo che il
 * browser eseguirebbe, non a validare il formato.
 */
export function isAllowedDataUrl(dataUrl: string): boolean {
  const match = /^data:([a-z0-9.+/-]+);base64,/i.exec(dataUrl);
  if (!match?.[1]) return false;
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(match[1].toLowerCase());
}
