import "server-only";
import { normalizePhone } from "./types";

const GRAPH_API_VERSION = "v21.0";
const SEND_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

export interface WhatsAppCredentials {
  metaAccessToken: string;
  metaPhoneAccountId: string;
}

export class WhatsAppSendError extends Error {
  constructor(
    message: string,
    public readonly code: "not_configured" | "upstream_error" | "timeout"
  ) {
    super(message);
    this.name = "WhatsAppSendError";
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Invia un messaggio di testo tramite Meta WhatsApp Cloud API.
 *
 * Ritenta solo su errori transitori (429/5xx/timeout) con backoff esponenziale:
 * un 4xx di validazione è deterministico e ritentarlo sprecherebbe solo tempo.
 * Non logga mai il testo del messaggio né il token (PII / segreti).
 */
export async function sendWhatsAppMessage(
  credentials: WhatsAppCredentials,
  toPhone: string,
  text: string
): Promise<void> {
  if (!credentials.metaAccessToken || !credentials.metaPhoneAccountId) {
    throw new WhatsAppSendError("Credenziali WhatsApp non configurate.", "not_configured");
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${credentials.metaPhoneAccountId}/messages`;
  const body = JSON.stringify({
    messaging_product: "whatsapp",
    to: normalizePhone(toPhone),
    type: "text",
    text: { body: text },
  });

  let lastError: WhatsAppSendError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.metaAccessToken}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      if (response.ok) return;

      const detail = await response.text().catch(() => "");
      console.error("[whatsapp/client] Send failed", {
        status: response.status,
        attempt,
        detail: detail.slice(0, 500),
      });

      lastError = new WhatsAppSendError(
        `Invio WhatsApp non riuscito (HTTP ${response.status}).`,
        "upstream_error"
      );

      if (!isRetryableStatus(response.status)) throw lastError;
    } catch (error) {
      if (error instanceof WhatsAppSendError) throw error;

      const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
      console.error("[whatsapp/client] Send network error", { attempt, isTimeout });
      lastError = new WhatsAppSendError(
        isTimeout ? "Timeout nell'invio del messaggio WhatsApp." : "Errore di rete verso WhatsApp.",
        isTimeout ? "timeout" : "upstream_error"
      );
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 2 ** (attempt - 1) * 500));
    }
  }

  throw lastError ?? new WhatsAppSendError("Invio WhatsApp non riuscito.", "upstream_error");
}
