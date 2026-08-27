import "server-only";
import { normalizePhone } from "./types";
import { parsePublicHttpUrl } from "@/lib/net/safe-url";
import type { WhatsAppProviderId } from "./provider";

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

// --- Twilio ---

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  /** Mittente nel formato richiesto da Twilio, es. "whatsapp:+14155238886". */
  fromWhatsAppNumber: string;
}

/** `whatsapp:+391234567890`: Twilio lo richiede su From e To, non solo su uno dei due. */
function toTwilioAddress(phone: string): string {
  return `whatsapp:+${normalizePhone(phone)}`;
}

/**
 * Invia un messaggio di testo tramite l'API REST di Twilio.
 *
 * Stessa politica di retry di `sendWhatsAppMessage`: solo errori transitori,
 * backoff esponenziale, mai il testo del messaggio nei log.
 */
export async function sendWhatsAppMessageViaTwilio(
  credentials: TwilioCredentials,
  toPhone: string,
  text: string
): Promise<void> {
  if (!credentials.accountSid || !credentials.authToken || !credentials.fromWhatsAppNumber) {
    throw new WhatsAppSendError("Credenziali Twilio non configurate.", "not_configured");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`;
  const body = new URLSearchParams({
    From: credentials.fromWhatsAppNumber,
    To: toTwilioAddress(toPhone),
    Body: text,
  });
  const basicAuth = Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString(
    "base64"
  );

  let lastError: WhatsAppSendError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      if (response.ok) return;

      console.error("[whatsapp/client] Twilio send failed", { status: response.status, attempt });

      lastError = new WhatsAppSendError(
        `Invio WhatsApp via Twilio non riuscito (HTTP ${response.status}).`,
        "upstream_error"
      );

      if (!isRetryableStatus(response.status)) throw lastError;
    } catch (error) {
      if (error instanceof WhatsAppSendError) throw error;

      const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
      console.error("[whatsapp/client] Twilio network error", { attempt, isTimeout });
      lastError = new WhatsAppSendError(
        isTimeout ? "Timeout nell'invio via Twilio." : "Errore di rete verso Twilio.",
        isTimeout ? "timeout" : "upstream_error"
      );
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 2 ** (attempt - 1) * 500));
    }
  }

  throw lastError ?? new WhatsAppSendError("Invio via Twilio non riuscito.", "upstream_error");
}

// --- Webhook generico ---

export interface GenericWebhookCredentials {
  sendUrl: string;
  /** Bearer facoltativo: alcuni relay non richiedono autenticazione propria. */
  authToken?: string | null;
}

/**
 * Invia un messaggio tramite l'endpoint generico configurato dall'agenzia
 * (BSP non elencati fra i provider nativi).
 *
 * Corpo minimo e stabile — `{ to, text }` — perché è un contratto che
 * definiamo noi: un relay scritto per questo endpoint non deve rompersi se
 * domani aggiungiamo campi opzionali altrove.
 */
export async function sendWhatsAppMessageViaGenericWebhook(
  credentials: GenericWebhookCredentials,
  toPhone: string,
  text: string
): Promise<void> {
  if (!credentials.sendUrl) {
    throw new WhatsAppSendError("Webhook generico non configurato.", "not_configured");
  }

  const safe = parsePublicHttpUrl(credentials.sendUrl);
  if (!safe.ok) {
    throw new WhatsAppSendError("Indirizzo del webhook generico non valido.", "not_configured");
  }

  try {
    const response = await fetch(safe.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(credentials.authToken ? { Authorization: `Bearer ${credentials.authToken}` } : {}),
      },
      body: JSON.stringify({ to: normalizePhone(toPhone), text }),
      redirect: "error",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new WhatsAppSendError(
        `Invio WhatsApp via webhook generico non riuscito (HTTP ${response.status}).`,
        "upstream_error"
      );
    }
  } catch (error) {
    if (error instanceof WhatsAppSendError) throw error;

    const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
    throw new WhatsAppSendError(
      isTimeout ? "Timeout nell'invio via webhook generico." : "Errore di rete verso il webhook generico.",
      isTimeout ? "timeout" : "upstream_error"
    );
  }
}

// --- Dispatcher unificato ---

/** Credenziali risolte (già decifrate) per l'invio, indipendenti dal provider. */
export interface ResolvedWhatsAppCredentials {
  provider: WhatsAppProviderId;
  meta?: WhatsAppCredentials;
  twilio?: TwilioCredentials;
  generic?: GenericWebhookCredentials;
  /**
   * Sessione abbinata via QR. Solo l'identificativo: le chiavi restano sul
   * microservizio, che è l'unico a poter parlare con WhatsApp.
   */
  qr?: { sessionId: string };
}

/**
 * Vero quando c'è abbastanza per tentare un invio col provider risolto.
 *
 * Evita interrogazioni al database (lookup del lead, cronologia) per
 * un'agenzia che non ha ancora collegato nessun provider — lo stesso scopo
 * del vecchio controllo Meta-specifico che sostituisce.
 */
export function hasSendableCredentials(credentials: ResolvedWhatsAppCredentials): boolean {
  switch (credentials.provider) {
    case "qr":
      return Boolean(credentials.qr?.sessionId);
    case "twilio":
      return Boolean(credentials.twilio?.authToken);
    case "generic":
      return Boolean(credentials.generic?.sendUrl);
    case "meta":
    default:
      return Boolean(credentials.meta?.metaAccessToken && credentials.meta.metaPhoneAccountId);
  }
}

/**
 * Invia un messaggio usando il provider configurato dall'agenzia.
 *
 * Punto d'ingresso unico per chi deve solo "mandare questo testo a questo
 * numero" senza sapere quale trasporto c'è dietro: `conversation.ts` e
 * `reminders.ts` chiamano questa funzione, non più direttamente Meta.
 */
export async function sendWhatsAppMessageForProvider(
  credentials: ResolvedWhatsAppCredentials,
  toPhone: string,
  text: string
): Promise<void> {
  switch (credentials.provider) {
    case "qr": {
      if (!credentials.qr) {
        throw new WhatsAppSendError("Sessione WhatsApp non abbinata.", "not_configured");
      }

      // Import dinamico: `qr-service` legge l'ambiente e non deve essere
      // caricato nelle richieste delle agenzie che usano altri provider.
      const { sendViaQrSession, QrServiceError } = await import("./qr-service");
      try {
        return await sendViaQrSession(credentials.qr.sessionId, toPhone, text);
      } catch (error) {
        // Tradotto nell'errore di questo modulo: chi chiama gestisce già
        // `WhatsAppSendError` e non deve conoscere il microservizio.
        if (error instanceof QrServiceError) {
          throw new WhatsAppSendError(
            error.message,
            error.code === "not_configured" ? "not_configured" : "upstream_error"
          );
        }
        throw error;
      }
    }

    case "twilio":
      if (!credentials.twilio) {
        throw new WhatsAppSendError("Credenziali Twilio non configurate.", "not_configured");
      }
      return sendWhatsAppMessageViaTwilio(credentials.twilio, toPhone, text);

    case "generic":
      if (!credentials.generic) {
        throw new WhatsAppSendError("Webhook generico non configurato.", "not_configured");
      }
      return sendWhatsAppMessageViaGenericWebhook(credentials.generic, toPhone, text);

    case "meta":
    default:
      if (!credentials.meta) {
        throw new WhatsAppSendError("Credenziali WhatsApp non configurate.", "not_configured");
      }
      return sendWhatsAppMessage(credentials.meta, toPhone, text);
  }
}
