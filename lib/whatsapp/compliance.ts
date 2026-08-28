import { SITE_URL } from "@/lib/seo";

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

/**
 * Informativa breve + opt-out, obbligatoria nel **solo** primo messaggio.
 *
 * Compare unicamente in `buildOpeningMessage`, che gira una volta sola per
 * contatto: i turni di qualificazione successivi non la ripetono, e il prompt
 * dell'agente ha istruzione esplicita di non riproporla.
 *
 * # Due scelte di formulazione, entrambe volute
 *
 * **Forma di cortesia.** Qui parla l'agenzia a una persona che ha appena
 * chiesto informazioni da un portale e non la conosce (CLAUDE.md §1). Il "tu"
 * andrebbe bene nella nostra interfaccia, non in un messaggio che esce a nome
 * dell'agenzia.
 *
 * **Non si dichiara che proseguire la chat equivalga a un consenso.** Sotto
 * GDPR il consenso dev'essere una manifestazione attiva e inequivocabile: il
 * silenzio o la prosecuzione di una conversazione non lo sono (art. 4 n. 11 e
 * cons. 32). Del resto qui il consenso non serve — chi scrive per avere
 * informazioni su una casa attiva misure precontrattuali richieste
 * dall'interessato (art. 6 §1 lett. b). Scrivere "acconsenti proseguendo"
 * darebbe all'agenzia una base giuridica che non regge a un controllo, ed e'
 * peggio che non scriverlo: se il trattamento e' contestato, quella frase
 * diventa la prova che ci si affidava a un consenso mai raccolto.
 *
 * Quel che la norma chiede davvero in questo momento e' la trasparenza — dire
 * chi tratta i dati, per cosa, e dove leggere il resto (art. 13) — ed e'
 * esattamente cio' che questo testo fa, con il link all'informativa estesa.
 */
export const PRIVACY_DISCLOSURE = [
  "ℹ️ Nota privacy: i suoi dati sono trattati solo per dare seguito a questa richiesta di informazioni sull'immobile, ai sensi del GDPR.",
  `Informativa completa: ${SITE_URL}/privacy`,
  "Risponda STOP per cancellarsi in qualsiasi momento.",
].join(" ");

/** Conferma di cancellazione inviata al riconoscimento dell'opt-out. */
export const OPT_OUT_CONFIRMATION =
  "Ricevuto. Non riceverà più messaggi automatici da noi e i suoi dati non saranno più utilizzati per questa richiesta. Grazie e buona giornata!";

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
