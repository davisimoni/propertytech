import "server-only";
import type { ChatMessage } from "./types";

/**
 * Ritmo umano degli invii automatici.
 *
 * # Perché un ritardo prima di rispondere
 *
 * Una risposta che arriva in duecento millisecondi non è una risposta: è la
 * firma di un programma. WhatsApp classifica i numeri anche sulla base di
 * questi segnali, e un numero classificato come automazione viene limitato o
 * sospeso — portandosi via, insieme, tutte le conversazioni dell'agenzia.
 *
 * Il ritardo è anche una cortesia verso il cliente: leggere una domanda,
 * pensarci e rispondere richiede qualche secondo anche a una persona, e una
 * replica istantanea a un messaggio articolato è sgradevole prima ancora che
 * sospetta.
 *
 * # Perché non si applica a tutto
 *
 * Tre invii restano immediati, e non per dimenticanza:
 *
 * - la **conferma di opt-out**, che il GDPR vuole immediatamente efficace;
 * - la **conferma di un comando dell'agente** (`!pausa`), che l'agente sta
 *   guardando in quel momento e che deve dirgli subito se è stato capito;
 * - il **primo messaggio di ingaggio**, che è la risposta a una richiesta
 *   appena arrivata da un portale e la cui rapidità è il prodotto.
 */

/**
 * Estremi del ritardo, in millisecondi.
 *
 * Cinque-dieci secondi e non due-quattro: e' il tempo che impiega una persona
 * a leggere un messaggio, pensarci e scrivere due righe sul telefono. Sotto i
 * cinque secondi la costanza dell'intervallo resta riconoscibile, ed e' la
 * regolarita' - piu' della rapidita' - a far classificare un numero come
 * automatico.
 *
 * Il tetto sta a dieci perche' l'attesa e' dentro la richiesta: la rotta ha
 * `maxDuration = 60` e il microservizio rinuncia dopo 45 secondi, quindi
 * dieci secondi di attesa piu' la generazione della risposta restano
 * abbondantemente dentro il margine. Alzarlo ancora significherebbe far
 * scadere la consegna per sembrare piu' umani, che e' un cattivo affare.
 */
export const TYPING_DELAY_MIN_MS = 5_000;
export const TYPING_DELAY_MAX_MS = 10_000;

/** Messaggi che l'assistente può inviare allo stesso contatto in un minuto. */
export const MAX_MESSAGES_PER_MINUTE = 3;

const MINUTE_MS = 60_000;

/** Ritardo casuale nell'intervallo previsto. Estratto a parte per i test. */
export function randomTypingDelayMs(): number {
  return Math.floor(Math.random() * (TYPING_DELAY_MAX_MS - TYPING_DELAY_MIN_MS)) + TYPING_DELAY_MIN_MS;
}

/**
 * Attende un tempo plausibile di digitazione.
 *
 * Il ritardo è **atteso dentro la richiesta**, non differito: la piattaforma
 * gira su funzioni senza stato, e un invio programmato per «fra tre secondi»
 * non avrebbe un processo vivo che lo esegua. Il costo è qualche secondo di
 * durata della funzione, ampiamente dentro il limite dichiarato sulla rotta.
 */
export async function humanTypingDelay(): Promise<number> {
  const ms = randomTypingDelayMs();
  await new Promise((resolve) => setTimeout(resolve, ms));
  return ms;
}

/**
 * Vero quando l'assistente ha già scritto troppo a questo contatto.
 *
 * # Perché si conta sulla cronologia e non in memoria
 *
 * Ogni messaggio in arrivo è una richiesta HTTP a sé, e su Vercel gira in
 * un'istanza che non condivide memoria con le altre: un contatore in una
 * variabile del processo conterebbe una frazione arbitraria degli invii, e
 * sarebbe peggio che non averlo — darebbe l'impressione di una protezione che
 * non c'è.
 *
 * La cronologia porta già un `timestamp` per ogni messaggio ed è condivisa fra
 * tutte le istanze: contare lì è esatto e non richiede né tabelle né stato
 * aggiuntivo.
 *
 * # A cosa serve davvero
 *
 * Non a limitare una conversazione normale — tre risposte in sessanta secondi
 * non capitano quando a scrivere è una persona. Serve a spezzare un **anello
 * di ripetizione**: due sistemi automatici che si rispondono a vicenda, o un
 * nostro guasto che rilancia lo stesso invio. Senza, quell'anello gira finché
 * qualcuno non se ne accorge, e nel frattempo il numero dell'agenzia viene
 * segnalato.
 */
export function hasExceededRate(
  history: ChatMessage[],
  now: Date = new Date()
): boolean {
  const soglia = now.getTime() - MINUTE_MS;

  const recenti = history.filter((message) => {
    if (message.sender !== "bot") return false;
    const t = Date.parse(message.timestamp);
    // Un timestamp illeggibile non deve contare come invio recente: farebbe
    // scattare il limite su una cronologia importata o corrotta, zittendo
    // l'assistente su una conversazione perfettamente normale.
    return Number.isFinite(t) && t >= soglia;
  });

  return recenti.length >= MAX_MESSAGES_PER_MINUTE;
}
