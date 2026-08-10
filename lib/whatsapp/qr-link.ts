import { normalizePhone } from "./types";

/**
 * Link `wa.me` da cifrare nel QR dell'agenzia.
 *
 * Modulo puro e client-safe: la stessa costruzione serve al server che genera
 * l'immagine e all'anteprima nel browser, e un link sbagliato stampato su
 * cento cartelli è un errore che si scopre troppo tardi.
 */

/** Messaggio proposto quando l'agente non ne scrive uno suo. */
export const DEFAULT_QR_MESSAGE =
  "Salve, ho visto questo immobile e vorrei ricevere maggiori informazioni.";

/** Tetto al testo precompilato: oltre, alcuni telefoni troncano il messaggio. */
export const MAX_QR_MESSAGE_LENGTH = 300;

export type QrLinkResult =
  | { ok: true; url: string; phone: string }
  | { ok: false; reason: "missing_phone" | "invalid_phone" };

/**
 * Costruisce l'indirizzo che apre WhatsApp con il numero dell'agenzia e il
 * messaggio già scritto.
 *
 * Il numero va in E.164 senza segni: `wa.me` rifiuta spazi, punti e il `+`
 * iniziale, e un QR con un numero mal formato porta a una chat vuota senza
 * dire perché.
 */
export function buildWhatsAppQrLink(
  rawPhone: string | null | undefined,
  message?: string | null
): QrLinkResult {
  if (!rawPhone?.trim()) return { ok: false, reason: "missing_phone" };

  const phone = normalizePhone(rawPhone);

  // Un numero internazionale valido sta fra 8 e 15 cifre (E.164). Sotto è
  // quasi certamente un numero scritto senza prefisso.
  if (phone.length < 8 || phone.length > 15) {
    return { ok: false, reason: "invalid_phone" };
  }

  const text = (message ?? DEFAULT_QR_MESSAGE).trim().slice(0, MAX_QR_MESSAGE_LENGTH);
  const query = text ? `?text=${encodeURIComponent(text)}` : "";

  return { ok: true, url: `https://wa.me/${phone}${query}`, phone };
}

/** Messaggi d'errore pronti per la UI. */
export const QR_LINK_MESSAGES: Record<
  Extract<QrLinkResult, { ok: false }>["reason"],
  string
> = {
  missing_phone:
    "Collega prima il numero WhatsApp dell'agenzia: senza, il QR non porterebbe da nessuna parte.",
  invalid_phone:
    "Il numero non sembra completo. Inseriscilo con il prefisso internazionale, ad esempio +39 02 1234567.",
};
