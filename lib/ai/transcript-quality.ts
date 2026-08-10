/**
 * Ripulitura delle trascrizioni Whisper dalle allucinazioni.
 *
 * Sui tratti di audio senza parlato — silenzio, rumore di fondo, il traffico
 * mentre l'agente cammina verso l'auto — Whisper non restituisce una stringa
 * vuota: inventa. Produce le frasi più frequenti nel corpus con cui è stato
 * addestrato, che è pieno di sottotitoli di YouTube. Da qui i "Sottotitoli
 * creati dalla comunità Amara.org" e i "Grazie per aver guardato il video".
 *
 * Senza questo filtro quel testo entra nel report che l'agenzia invia al
 * proprietario dell'immobile: un documento che esce dall'agenzia e ne
 * rappresenta la professionalità.
 *
 * Modulo puro e senza dipendenze, così è testabile in isolamento.
 */

/**
 * Frammenti che marcano una frase come allucinata, confrontati sul testo
 * normalizzato (minuscolo, senza accenti né punteggiatura).
 *
 * Sono volutamente specifici: bloccano formule che nessun agente immobiliare
 * pronuncerebbe descrivendo una visita. Un elenco più generico rischierebbe di
 * scartare contenuto autentico, che è l'errore peggiore dei due — meglio un
 * report con una riga di rumore che un report a cui manca un'informazione data
 * dall'agente.
 */
const HALLUCINATION_MARKERS = [
  // Crediti di sottotitolaggio: la famiglia più frequente in italiano.
  "sottotitoli e revisione a cura di",
  "sottotitoli creati dalla comunita",
  "sottotitoli a cura di",
  "sottotitoli di",
  "amara org",
  "qtss",
  // Formule di chiusura dei video.
  "grazie per aver guardato il video",
  "grazie per aver visto il video",
  "grazie per l attenzione e alla prossima",
  "iscriviti al canale",
  "iscrivetevi al canale",
  "metti mi piace",
  "ci vediamo nel prossimo video",
  "alla prossima puntata",
  // Equivalenti inglesi: Whisper cambia lingua da solo sul rumore.
  "subtitles by the amara org community",
  "thanks for watching",
  "thank you for watching",
  "please subscribe",
  "like and subscribe",
  // Artefatti ricorrenti noti.
  "www mooji org",
  "sous titres realises par",
];

/**
 * Quante ripetizioni consecutive della stessa frase bastano a considerarla un
 * ciclo degenere. Whisper, incagliato sul rumore, ripete la stessa sequenza
 * decine di volte; una persona che si ripete due volte è invece plausibile.
 */
const MAX_CONSECUTIVE_REPEATS = 3;

/** Sotto questa soglia di parole residue la trascrizione non ha contenuto utile. */
const MIN_MEANINGFUL_WORDS = 3;

/** Forma confrontabile: minuscolo, senza accenti, senza punteggiatura. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Divide in frasi conservando il testo originale, non quello normalizzato. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function isHallucinated(sentence: string): boolean {
  const normalized = normalize(sentence);
  if (!normalized) return true;

  return HALLUCINATION_MARKERS.some((marker) => normalized.includes(marker));
}

export interface TranscriptCleanupResult {
  /** Testo ripulito, pronto per il generatore di report. */
  text: string;
  /** Frasi rimosse perché riconosciute come allucinazioni. */
  removedHallucinations: number;
  /** Frasi rimosse perché ripetizioni degeneri. */
  removedRepetitions: number;
  /** `true` se dopo la pulizia non resta contenuto utilizzabile. */
  isEmpty: boolean;
}

/**
 * Ripulisce la trascrizione e segnala se resta qualcosa di utilizzabile.
 *
 * Filtra per frase anziché scartare l'intera trascrizione: l'allucinazione si
 * concentra tipicamente in coda, sulla parte silenziosa dopo che l'agente ha
 * smesso di parlare, mentre il resto della nota è perfettamente valido.
 */
export function cleanTranscript(raw: string): TranscriptCleanupResult {
  const sentences = splitSentences(raw);

  const kept: string[] = [];
  let removedHallucinations = 0;
  let removedRepetitions = 0;
  let lastNormalized = "";
  let repeatRun = 0;

  for (const sentence of sentences) {
    if (isHallucinated(sentence)) {
      removedHallucinations++;
      continue;
    }

    const normalized = normalize(sentence);

    if (normalized === lastNormalized) {
      repeatRun++;
      // Le prime ripetizioni restano: possono essere un'esitazione reale.
      if (repeatRun >= MAX_CONSECUTIVE_REPEATS) {
        removedRepetitions++;
        continue;
      }
    } else {
      repeatRun = 0;
      lastNormalized = normalized;
    }

    kept.push(sentence);
  }

  const text = kept.join(" ").replace(/\s+/g, " ").trim();
  const wordCount = normalize(text).split(" ").filter(Boolean).length;

  return {
    text,
    removedHallucinations,
    removedRepetitions,
    isEmpty: wordCount < MIN_MEANINGFUL_WORDS,
  };
}

/** Esportati per i test: sono le due parti che decidono cosa viene scartato. */
export const __testables = { normalize, splitSentences, isHallucinated };
