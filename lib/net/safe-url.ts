/**
 * Guardia SSRF condivisa per gli URL forniti dall'utente.
 *
 * Vive in un modulo solo perché le regole devono essere le stesse ovunque: due
 * copie divergono al primo aggiornamento, e la copia dimenticata diventa il
 * buco. La usano l'import annunci da link (Modulo 3) e il webhook verso il
 * gestionale (integrazione MLS).
 */

/** Motivo del rifiuto, per comporre un messaggio comprensibile all'utente. */
export type UnsafeUrlReason = "invalid_url" | "unsupported_scheme" | "private_host";

export type SafeUrlResult =
  | { ok: true; url: URL }
  | { ok: false; reason: UnsafeUrlReason };

/**
 * Host che non devono mai essere raggiungibili da una richiesta originata dal
 * nostro server: loopback, reti private RFC 1918, link-local (che su cloud
 * espone i metadata delle istanze) e suffissi di rete interna.
 */
function isPrivateHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === "[::1]" ||
    host === "[::]" ||
    host.startsWith("[fd") ||
    host.startsWith("[fc") ||
    host.startsWith("[fe80")
  );
}

/** Valida un URL fornito dall'utente prima che il server lo contatti. */
export function parsePublicHttpUrl(rawUrl: string): SafeUrlResult {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "unsupported_scheme" };
  }

  if (isPrivateHost(url.hostname.toLowerCase())) {
    return { ok: false, reason: "private_host" };
  }

  return { ok: true, url };
}

/** Messaggi pronti per la UI, senza dettagli tecnici che non aiutano l'agente. */
export const UNSAFE_URL_MESSAGES: Record<UnsafeUrlReason, string> = {
  invalid_url: "Il link non sembra valido.",
  unsupported_scheme: "Sono ammessi solo indirizzi http o https.",
  private_host: "Questo indirizzo non è raggiungibile dall'esterno.",
};
