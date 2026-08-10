import "server-only";
import { createHash } from "node:crypto";

/**
 * Protezione anti-abuso del modulo di contatto pubblico.
 *
 * PERCHÉ IL CONTEGGIO STA NEL DATABASE E NON IN MEMORIA.
 *
 * Il deploy è serverless: ogni richiesta può finire su un'istanza diversa, e
 * un contatore in memoria conterebbe solo gli invii capitati sulla stessa. Con
 * qualche istanza attiva un limite di "3 all'ora" ne lascerebbe passare tre per
 * istanza — cioè non sarebbe un limite. Contare le righe già scritte è l'unica
 * misura che tutte le istanze condividono.
 */

/** Finestra di osservazione. */
export const RATE_WINDOW_MINUTES = 60;

/**
 * Invii ammessi per indirizzo IP nella finestra.
 *
 * Tre e non uno: da un'agenzia con più agenti le richieste escono dallo stesso
 * IP aziendale, e bloccare il secondo collega sarebbe un danno commerciale,
 * non una protezione.
 */
export const MAX_PER_IP = 3;

/** Invii ammessi per indirizzo email: più stretto, l'email è individuale. */
export const MAX_PER_EMAIL = 2;

/**
 * Impronta dell'indirizzo IP.
 *
 * Con sale, perché lo spazio degli indirizzi IPv4 è piccolo abbastanza da
 * essere percorso per intero: un SHA-256 senza sale sarebbe reversibile in
 * pochi minuti, e non sarebbe una pseudonimizzazione.
 */
export function hashIp(ip: string): string {
  const salt = process.env.ENCRYPTION_KEY ?? process.env.NEXTAUTH_SECRET ?? "propertytech";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/**
 * Indirizzo del chiamante secondo gli header del proxy.
 *
 * `x-forwarded-for` può contenere una catena: il primo elemento è il client
 * originale. Ci si fida perché davanti c'è Vercel, che riscrive l'header; su
 * un'origine esposta direttamente sarebbe falsificabile.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return headers.get("x-real-ip")?.trim() || null;
}

export interface RateLimitVerdict {
  allowed: boolean;
  /** Messaggio già pronto per l'utente, senza dettagli sfruttabili. */
  message?: string;
}

/**
 * Verdetto a partire dai conteggi già eseguiti dal chiamante.
 *
 * Separata dalla query perché è la parte che vale la pena verificare: il
 * confronto di due numeri con una soglia si sbaglia facilmente di uno.
 */
export function evaluateRateLimit(recentFromIp: number, recentFromEmail: number): RateLimitVerdict {
  if (recentFromEmail >= MAX_PER_EMAIL) {
    return {
      allowed: false,
      message:
        "Abbiamo già ricevuto la tua richiesta e ti risponderemo a breve. Se è urgente scrivici a info@propertytechsolutions.net.",
    };
  }

  if (recentFromIp >= MAX_PER_IP) {
    return {
      allowed: false,
      message:
        "Hai inviato troppe richieste ravvicinate. Riprova fra un'ora oppure scrivici a info@propertytechsolutions.net.",
    };
  }

  return { allowed: true };
}

/** Istante da cui contare gli invii recenti. */
export function windowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - RATE_WINDOW_MINUTES * 60_000);
}
