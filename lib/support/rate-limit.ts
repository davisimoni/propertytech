/**
 * Limite di frequenza dell'assistente clienti.
 *
 * Modulo puro: decide a partire da due conteggi già eseguiti dal chiamante,
 * così le soglie — dove si sbaglia facilmente di uno — si verificano senza un
 * database davanti.
 *
 * Serve più che sul modulo di contatto: qui ogni messaggio **costa token**, e
 * la rotta è raggiungibile senza autenticazione da chiunque conosca l'indirizzo.
 */

/** Finestra breve: ferma chi tiene premuto invio. */
export const BURST_WINDOW_SECONDS = 60;
export const MAX_PER_BURST = 6;

/** Finestra lunga: ferma chi ci gira uno script contro per un'ora. */
export const HOURLY_WINDOW_MINUTES = 60;
export const MAX_PER_HOUR = 40;

export interface RateVerdict {
  allowed: boolean;
  /** Messaggio già pronto per l'utente, senza dettagli sfruttabili. */
  message?: string;
}

/**
 * Verdetto sui due conteggi.
 *
 * La finestra breve si valuta per prima: chi la supera va avvisato che deve
 * solo rallentare, non che è stato bloccato per un'ora.
 */
export function evaluateChatRate(recentBurst: number, recentHour: number): RateVerdict {
  if (recentBurst >= MAX_PER_BURST) {
    return {
      allowed: false,
      message: "Stai scrivendo molto in fretta: aspetta qualche secondo e riprova.",
    };
  }

  if (recentHour >= MAX_PER_HOUR) {
    return {
      allowed: false,
      message:
        "Hai raggiunto il limite di messaggi per questa ora. Se ti serve subito una risposta scrivici a supporto@propertytechsolutions.net.",
    };
  }

  return { allowed: true };
}

export function burstWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - BURST_WINDOW_SECONDS * 1_000);
}

export function hourlyWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - HOURLY_WINDOW_MINUTES * 60_000);
}

/**
 * Da quando le tracce non servono più.
 *
 * Le righe vengono cancellate dopo la finestra più lunga: sono dati di traffico
 * legati a un'impronta di IP, e tenerli oltre l'uso che se ne fa non avrebbe
 * base. Si ripulisce opportunisticamente, senza uno scheduler dedicato.
 */
export function staleBefore(now: Date = new Date()): Date {
  return new Date(now.getTime() - HOURLY_WINDOW_MINUTES * 2 * 60_000);
}
