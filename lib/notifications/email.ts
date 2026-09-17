import "server-only";
import { readSecret } from "@/lib/env";

/**
 * Invio email transazionali.
 *
 * # Un seam, non un'integrazione
 *
 * Stessa forma del seam Speech-to-Text in `lib/ai/transcription.ts`: il
 * fornitore si configura dall'ambiente e il resto dell'applicazione non lo
 * conosce. Parla con l'API HTTP di Resend, che e' quella dei suoi
 * `RESEND_API_KEY`, ma il contratto qui sotto e' minimo (destinatario,
 * oggetto, testo) proprio perche' sostituirlo con Postmark, SES o un SMTP
 * aziendale significhi riscrivere solo `deliver()`.
 *
 * Nessuna dipendenza aggiunta: una POST con `fetch` fa esattamente lo stesso
 * lavoro dell'SDK, e un pacchetto in meno e' un pacchetto in meno da
 * aggiornare.
 *
 * # Non configurato non e' un errore
 *
 * Senza chiave la funzione **non lancia**: registra un avviso e torna
 * `not_configured`. Le notifiche sono un contorno — un lead qualificato resta
 * qualificato anche se l'email non parte — e far fallire una conversazione
 * WhatsApp perche' manca una variabile d'ambiente sarebbe il tipo di
 * accoppiamento che trasforma un dettaglio di configurazione in un guasto.
 *
 * # Residenza dei dati
 *
 * Il corpo di queste email contiene nome, telefono e budget di una persona.
 * Il fornitore va scelto e configurato con trattamento in UE, coerentemente
 * con la data residency del resto della piattaforma (CLAUDE.md §5): Resend
 * espone la regione `eu-west-1` a questo scopo.
 */

const ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export type EmailOutcome = "sent" | "not_configured" | "failed";

export interface EmailMessage {
  to: string;
  subject: string;
  /**
   * Corpo in testo semplice.
   *
   * Sempre presente, anche quando c'e' l'HTML: e' quello che leggono i client
   * che l'HTML non lo mostrano, ed e' anche cio' che finisce nei filtri
   * antispam. Un'email con il solo HTML parte con una penalizzazione.
   */
  text: string;
  /** Corpo HTML facoltativo, per le email che hanno bisogno di un pulsante. */
  html?: string;
  /**
   * Indirizzo a cui deve andare la risposta, quando non e' il mittente.
   *
   * Serve alle email che riportano il messaggio di un terzo: una richiesta dal
   * modulo di contatto arriva dall'indirizzo di servizio, ma chi in assistenza
   * preme "Rispondi" vuole scrivere a chi ha compilato il modulo, non alla
   * casella che ha spedito la notifica. Senza questo campo la risposta finisce
   * a un mittente che nessuno legge, e la richiesta resta senza risposta pur
   * essendo arrivata.
   */
  replyTo?: string;
  /**
   * Solo per la newsletter: indirizzo di disiscrizione in un clic.
   *
   * La sua presenza è ciò che distingue un invio di marketing. Diventa le
   * intestazioni `List-Unsubscribe` e `List-Unsubscribe-Post` (RFC 8058), che
   * Gmail e Yahoo richiedono ai mittenti di posta promozionale e che mostrano
   * il comando "Annulla iscrizione" accanto al mittente. Le email di servizio
   * non la portano mai: non sono revocabili dal destinatario, e un comando di
   * disiscrizione accanto a "Sessione WhatsApp disconnessa" farebbe credere di
   * poterle spegnere.
   */
  unsubscribeUrl?: string;
}

/** Vero quando il seam e' configurato: la UI puo' dire se le notifiche partiranno. */
export function isEmailConfigured(): boolean {
  return Boolean(readSecret("RESEND_API_KEY") && readSecret("NOTIFICATIONS_FROM_EMAIL"));
}

/**
 * Mittente di un invio.
 *
 * # Due flussi, due mittenti quando possibile
 *
 * La reputazione di invio si costruisce per indirizzo e dominio. Una
 * newsletter segnata come spam da qualche destinatario abbassa la reputazione
 * di chi la spedisce, e se il mittente è lo stesso delle email di servizio la
 * prossima "Sessione WhatsApp disconnessa" finisce nella stessa cartella.
 * `NEWSLETTER_FROM_EMAIL` (idealmente su un sottodominio dedicato) tiene le
 * due reputazioni separate; senza, la newsletter usa il mittente di servizio.
 */
function mittente(marketing: boolean): string | undefined {
  const servizio = readSecret("NOTIFICATIONS_FROM_EMAIL");
  if (!marketing) return servizio;
  return readSecret("NEWSLETTER_FROM_EMAIL") ?? servizio;
}

/**
 * Recapita una email. Non lancia mai: l'esito torna come valore.
 *
 * Chi chiama e' sempre un percorso che stava facendo altro (qualificare un
 * lead, chiudere una conversazione) e non deve avere modo di rompersi qui.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailOutcome> {
  const apiKey = readSecret("RESEND_API_KEY");
  const marketing = Boolean(message.unsubscribeUrl);
  const from = mittente(marketing);

  if (!apiKey || !from) {
    console.warn("[notifications/email] Non configurato: notifica non inviata", {
      subject: message.subject,
      // Nessun destinatario nei log: e' un dato personale, e questo ramo scatta
      // a ogni lead qualificato finche' non si configura il fornitore.
    });
    return "not_configured";
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.unsubscribeUrl
          ? {
              headers: {
                "List-Unsubscribe": `<${message.unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }
          : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[notifications/email] Il fornitore ha rifiutato l'invio", {
        status: response.status,
        detail: detail.slice(0, 300),
      });
      return "failed";
    }

    return "sent";
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
    console.error("[notifications/email] Invio non riuscito", { isTimeout });
    return "failed";
  }
}
