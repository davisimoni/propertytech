import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { MIN_PASSWORD_LENGTH, type ResetState } from "./password-rules";

// Ri-esportate per comodita' di chi lavora lato server: le definizioni vivono
// in `password-rules.ts`, che non importa `node:crypto` ed e' quindi
// utilizzabile anche dal browser.
export {
  MIN_PASSWORD_LENGTH,
  RESET_STATE_MESSAGES,
  validatePassword,
  type ResetState,
} from "./password-rules";

/**
 * Token di reimpostazione password.
 *
 * Modulo puro, come quello degli inviti: genera e verifica senza toccare il
 * database, così la parte che dà accesso a un account è testabile in
 * isolamento.
 */

/**
 * Un'ora. Molto più corto dei sette giorni di un invito, e per un motivo
 * preciso: un link di reset è una chiave dell'account già esistente, mentre
 * un invito crea un accesso che ancora non c'è. Se la casella di posta viene
 * compromessa più tardi, un token scaduto non serve a niente.
 */
export const RESET_TTL_MINUTES = 60;

/** 32 byte casuali: 256 bit, non si indovina per tentativi. */
const TOKEN_BYTES = 32;

export interface GeneratedReset {
  /** Va nel link. Non è più recuperabile dopo questa risposta. */
  token: string;
  /** L'unica forma che finisce nel database. */
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Del token si salva solo l'impronta.
 *
 * SHA-256 senza salt è adeguato: il token ha già 256 bit di entropia, quindi
 * non esiste un dizionario da cui partire. Il salt serve contro le password,
 * che di entropia ne hanno poca.
 */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateReset(now: Date = new Date()): GeneratedReset {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");

  return {
    token,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(now.getTime() + RESET_TTL_MINUTES * 60 * 1000),
  };
}

/**
 * Stato di un token, dai campi salvati.
 *
 * Tre esiti distinti e non un booleano: chi apre un link scaduto deve sapere
 * che deve richiederne un altro, non credere che il link fosse sbagliato e
 * riprovare a copiarlo.
 */
export function resetState(
  record: { expiresAt: Date; usedAt: Date | null } | null,
  now: Date = new Date()
): ResetState {
  if (!record) return "not_found";
  if (record.usedAt) return "already_used";
  if (record.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}

/**
 * Confronto a tempo costante fra due impronte.
 *
 * La ricerca nel database avviene su `tokenHash` indicizzato, quindi questo
 * serve solo dove si confrontano due valori già in memoria. Un `===` su
 * stringhe esce al primo carattere diverso, e su un segreto è un'informazione
 * che non c'è motivo di regalare.
 */
export function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
