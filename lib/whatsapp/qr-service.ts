import "server-only";
import { readSecret } from "@/lib/env";

/**
 * Client verso il microservizio che tiene aperto il socket WhatsApp.
 *
 * # Perché esiste un servizio separato
 *
 * L'abbinamento via QR è quello di WhatsApp Web: richiede una connessione
 * persistente e uno stato di sessione che sopravvive fra un messaggio e
 * l'altro. Su Vercel le funzioni sono senza stato, durano al massimo un
 * minuto e girano in istanze che non condividono memoria: il socket non può
 * viverci. Il servizio va quindi ospitato altrove, su un host sempre acceso
 * (Render, Railway, un VPS) — vedi `whatsapp-service/README.md`.
 *
 * # Il contratto è nostro, di proposito
 *
 * Le quattro chiamate qui sotto sono definite da noi e implementate dal
 * microservizio di riferimento nel README. Non è un dettaglio di comodo:
 * appoggiarsi al contratto di un prodotto terzo che non possiamo collaudare
 * significa scoprirne le differenze in produzione, con richieste che
 * falliscono per un nome di campo diverso. Chi preferisce Evolution API o un
 * altro gestore lo mette dietro questo stesso contratto con un adattatore
 * sottile, e l'applicazione non cambia di una riga.
 *
 * # Sicurezza
 *
 * Il servizio custodisce le chiavi di sessione WhatsApp dell'agenzia: chi lo
 * raggiunge può scrivere ai suoi clienti a suo nome. Va quindi esposto solo
 * dietro `WHATSAPP_SERVICE_TOKEN`, e i suoi webhook verso di noi vanno
 * firmati con lo stesso segreto.
 */

const REQUEST_TIMEOUT_MS = 20_000;

export type QrSessionStatus = "pending" | "connected" | "disconnected";

export interface QrConnectResult {
  /** Immagine del QR come data URI, pronta da mettere in un `<img src>`. */
  qrDataUrl: string;
}

export interface QrStatusResult {
  status: QrSessionStatus;
  /** Numero abbinato, disponibile solo a sessione connessa. */
  phoneNumber: string | null;
}

export class QrServiceError extends Error {
  constructor(
    message: string,
    public readonly code: "not_configured" | "upstream_error" | "timeout"
  ) {
    super(message);
    this.name = "QrServiceError";
  }
}

/** Vero quando il microservizio è configurato: la UI non offre ciò che non può funzionare. */
export function isQrServiceConfigured(): boolean {
  return Boolean(readSecret("WHATSAPP_SERVICE_URL") && readSecret("WHATSAPP_SERVICE_TOKEN"));
}

function serviceConfig(): { baseUrl: string; token: string } {
  const baseUrl = readSecret("WHATSAPP_SERVICE_URL");
  const token = readSecret("WHATSAPP_SERVICE_TOKEN");

  if (!baseUrl || !token) {
    throw new QrServiceError(
      "Il servizio di collegamento WhatsApp non è configurato su questo ambiente.",
      "not_configured"
    );
  }

  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

async function callService<T>(path: string, init: RequestInit): Promise<T> {
  const { baseUrl, token } = serviceConfig();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
    console.error("[whatsapp/qr-service] Chiamata non riuscita", { path, isTimeout });
    throw new QrServiceError(
      isTimeout
        ? "Il servizio di collegamento non ha risposto in tempo."
        : "Impossibile raggiungere il servizio di collegamento.",
      isTimeout ? "timeout" : "upstream_error"
    );
  }

  if (!response.ok) {
    // Il corpo dell'errore nei log: è lì che il microservizio spiega se la
    // sessione è scaduta, se il numero è stato disconnesso dal telefono o se
    // la chiave non è valida — tre rimedi diversi.
    const detail = await response.text().catch(() => "");
    console.error("[whatsapp/qr-service] Il servizio ha rifiutato la richiesta", {
      path,
      status: response.status,
      detail: detail.slice(0, 300),
    });
    throw new QrServiceError("Il servizio di collegamento ha restituito un errore.", "upstream_error");
  }

  return (await response.json()) as T;
}

/**
 * Apre (o riapre) una sessione e restituisce il QR da inquadrare.
 *
 * Richiamabile più volte sulla stessa sessione: il QR di WhatsApp scade dopo
 * una ventina di secondi, e l'interfaccia deve poterne chiedere uno nuovo
 * senza buttare via la sessione e ricominciare.
 */
export async function requestQrCode(sessionId: string): Promise<QrConnectResult> {
  return callService<QrConnectResult>(`/sessions/${encodeURIComponent(sessionId)}/connect`, {
    method: "POST",
  });
}

/** Stato corrente della sessione, interrogato dal polling dell'interfaccia. */
export async function fetchQrStatus(sessionId: string): Promise<QrStatusResult> {
  return callService<QrStatusResult>(`/sessions/${encodeURIComponent(sessionId)}/status`, {
    method: "GET",
  });
}

/** Chiude la sessione ed elimina le credenziali sul microservizio. */
export async function destroyQrSession(sessionId: string): Promise<void> {
  await callService<{ ok: boolean }>(`/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
}

/** Invia un messaggio attraverso la sessione abbinata. */
export async function sendViaQrSession(
  sessionId: string,
  toPhone: string,
  text: string,
  chatJid?: string | null
): Promise<void> {
  await callService<{ ok: boolean }>(`/sessions/${encodeURIComponent(sessionId)}/send`, {
    method: "POST",
    // `jid` quando lo conosciamo: e' l'indirizzo esatto della chat da cui il
    // messaggio e' arrivato, e vale sia per i numeri sia per i LID. `to` resta
    // per i lead dei portali, dove abbiamo un numero vero e nessuna chat
    // precedente da cui ricavare un indirizzo.
    body: JSON.stringify({ to: toPhone, text, ...(chatJid ? { jid: chatJid } : {}) }),
  });
}
