/**
 * Regole sulla password, condivise fra browser e server.
 *
 * Modulo separato da `password-reset.ts` per una ragione precisa: quello usa
 * `node:crypto`, e importarlo da un componente client trascina il modulo Node
 * nel bundle del browser — dove non esiste. Il form ha bisogno solo della
 * lunghezza minima e dei messaggi, che non sono crittografia.
 *
 * La costante sta qui e non duplicata nei due punti: il server rifiuterebbe
 * ciò che il form ha accettato, e l'utente vedrebbe un errore su una password
 * che l'interfaccia gli aveva dato per buona.
 */

/** Lunghezza minima. Allineata alla registrazione. */
export const MIN_PASSWORD_LENGTH = 8;

export type ResetState = "valid" | "expired" | "already_used" | "not_found";

export const RESET_STATE_MESSAGES: Record<Exclude<ResetState, "valid">, string> = {
  expired: "Questo link è scaduto. Richiedine uno nuovo: vale un'ora dall'invio.",
  already_used: "Questo link è già stato usato. Se ti serve, richiedine uno nuovo.",
  not_found: "Questo link non è valido. Controlla di averlo copiato per intero.",
};

/** Requisiti minimi della nuova password. */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`;
  }
  return null;
}
