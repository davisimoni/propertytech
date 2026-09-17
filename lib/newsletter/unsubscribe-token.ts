import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readSecret } from "@/lib/env";
import { SITE_URL } from "@/lib/seo";

/**
 * Token di disiscrizione dalla newsletter.
 *
 * # Perché firmato e senza scadenza
 *
 * Il link deve funzionare senza login — chi vuole smettere di ricevere una
 * newsletter non deve prima ricordarsi la password — e anche su un'email di
 * mesi fa. Firmato con HMAC perché nessuno possa disiscrivere un altro utente
 * cambiando un id nell'indirizzo. L'unico effetto possibile è spegnere la
 * newsletter di chi l'ha ricevuta: nessun dato viene esposto.
 *
 * Il prefisso di dominio nella firma impedisce di riusare questa firma per
 * altri scopi che condividano lo stesso segreto.
 */

const DOMINIO = "propertytech.newsletter.unsubscribe.v1";

function segreto(): string | null {
  return readSecret("NEXTAUTH_SECRET") ?? readSecret("AUTH_SECRET") ?? null;
}

function firma(userId: string, chiave: string): string {
  return createHmac("sha256", chiave).update(`${DOMINIO}:${userId}`).digest("base64url");
}

export function firmaDisiscrizione(userId: string): string | null {
  const chiave = segreto();
  return chiave ? `${userId}.${firma(userId, chiave)}` : null;
}

/** L'id dell'utente se il token è autentico, altrimenti `null`. */
export function verificaDisiscrizione(token: string | null | undefined): string | null {
  if (!token) return null;
  const chiave = segreto();
  if (!chiave) return null;

  const punto = token.lastIndexOf(".");
  if (punto <= 0) return null;
  const userId = token.slice(0, punto);
  const ricevuta = Buffer.from(token.slice(punto + 1), "utf8");
  const attesa = Buffer.from(firma(userId, chiave), "utf8");

  if (ricevuta.length !== attesa.length) return null;
  return timingSafeEqual(ricevuta, attesa) ? userId : null;
}

/** Indirizzo per la disiscrizione in un clic (intestazione `List-Unsubscribe`). */
export function urlDisiscrizioneUnClic(token: string): string {
  return `${SITE_URL}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Pagina di disiscrizione, per il link nel piè di pagina.
 *
 * Diversa dall'indirizzo in un clic perché un link aperto con GET non deve
 * disiscrivere da solo: i filtri antispam aziendali aprono i link delle email
 * per controllarli, e disiscriverebbero persone che non l'hanno chiesto.
 */
export function urlPaginaDisiscrizione(token: string): string {
  return `${SITE_URL}/newsletter/disiscrizione?token=${encodeURIComponent(token)}`;
}
