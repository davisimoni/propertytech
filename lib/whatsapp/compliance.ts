/**
 * Conformità GDPR del Modulo 1 (vedi CLAUDE.md §5).
 *
 * Due obblighi non negoziabili sono implementati qui:
 *  1. il primo messaggio automatico verso un nuovo contatto include informativa
 *     privacy breve e opt-out esplicito;
 *  2. l'opt-out è immediatamente efficace e persistito per quel contatto.
 */

/** Parole chiave che revocano il consenso. Confrontate su testo normalizzato. */
const OPT_OUT_KEYWORDS = [
  "stop",
  "cancellami",
  "cancellatemi",
  "privacy",
  "rimuovimi",
  "disiscrivimi",
  "unsubscribe",
];

/**
 * Riconosce una richiesta di opt-out. Confronta l'intero messaggio normalizzato
 * (accenti e punteggiatura rimossi) contro le keyword: un match su sottostringa
 * classificherebbe erroneamente frasi legittime come "non mi fermo".
 */
export function isOptOutMessage(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\p{L}\s]/gu, "")
    .trim();

  if (!normalized) return false;

  if (OPT_OUT_KEYWORDS.includes(normalized)) return true;

  // Tollera formulazioni brevi come "voglio la privacy" o "stop grazie",
  // ma non frasi lunghe in cui la keyword compare incidentalmente.
  const words = normalized.split(/\s+/);
  return words.length <= 3 && words.some((word) => OPT_OUT_KEYWORDS.includes(word));
}

/** Informativa privacy breve + opt-out, obbligatoria nel primo messaggio. */
export const PRIVACY_DISCLOSURE =
  "I tuoi dati sono trattati solo per gestire questa richiesta, ai sensi del GDPR. Rispondi STOP per cancellarti in qualsiasi momento.";

/** Conferma di cancellazione inviata al riconoscimento dell'opt-out. */
export const OPT_OUT_CONFIRMATION =
  "Ricevuto. Non riceverai più messaggi automatici da noi e i tuoi dati non saranno più utilizzati per questa richiesta. Grazie e buona giornata!";

/** Compone il primo messaggio: saluto personalizzato + immobile + informativa. */
export function buildOpeningMessage(
  clientName: string,
  propertyRef: string,
  agencyName: string,
  firstQuestion: string
): string {
  return [
    `Buongiorno ${clientName}, sono l'assistente virtuale di ${agencyName}.`,
    `La contatto per la sua richiesta di informazioni su "${propertyRef}".`,
    firstQuestion,
    "",
    PRIVACY_DISCLOSURE,
  ].join("\n\n");
}
