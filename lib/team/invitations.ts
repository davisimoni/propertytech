import { createHash, randomBytes } from "node:crypto";

/**
 * Inviti dei collaboratori.
 *
 * Modulo puro: genera e verifica i token senza toccare il database, così la
 * parte delicata — quella che dà accesso ai dati di un'agenzia — è testabile
 * in isolamento.
 */

/** Durata dell'invito. Oltre, il link va rigenerato dal titolare. */
export const INVITE_TTL_DAYS = 7;

/** 32 byte casuali: indovinarlo per tentativi non è una strada praticabile. */
const TOKEN_BYTES = 32;

export interface GeneratedInvite {
  /** Va nel link consegnato alla persona. Non è più recuperabile dopo. */
  token: string;
  /** L'unica forma che finisce nel database. */
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Del token si salva solo l'impronta.
 *
 * Chi legge il database — un backup finito nel posto sbagliato, un accesso in
 * sola lettura — non deve poter ricostruire un link valido ed entrare
 * nell'agenzia. SHA-256 senza salt è adeguato qui: il token ha già 256 bit di
 * entropia, quindi non esiste un dizionario da cui partire.
 */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateInvite(now: Date = new Date()): GeneratedInvite {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");

  return {
    token,
    tokenHash: hashInviteToken(token),
    expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}

/** Link da consegnare al collaboratore. */
export function buildInviteUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/invito/${token}`;
}

export type InviteState = "valid" | "expired" | "already_accepted" | "not_found";

/**
 * Stato di un invito, a partire dai campi salvati.
 *
 * Restituisce uno stato invece di un booleano perché le tre situazioni vanno
 * spiegate in modo diverso a chi apre il link: uno scaduto si rigenera, uno
 * già accettato significa che basta accedere.
 */
export function inviteState(
  invite: { inviteExpiresAt: Date | null; acceptedAt: Date | null } | null,
  now: Date = new Date()
): InviteState {
  if (!invite) return "not_found";
  if (invite.acceptedAt) return "already_accepted";
  if (!invite.inviteExpiresAt || invite.inviteExpiresAt <= now) return "expired";
  return "valid";
}

/** Messaggi pronti per la pagina di accettazione. */
export const INVITE_STATE_MESSAGES: Record<Exclude<InviteState, "valid">, string> = {
  not_found:
    "Questo invito non è valido. Chiedi al titolare dell'agenzia di generarne uno nuovo.",
  expired: `L'invito è scaduto dopo ${INVITE_TTL_DAYS} giorni. Chiedi al titolare di rigenerarlo.`,
  already_accepted:
    "Questo invito è già stato usato. Accedi con l'email e la password che hai impostato.",
};
