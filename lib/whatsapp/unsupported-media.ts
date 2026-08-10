import type { ChatMessage } from "@/lib/whatsapp/types";

/**
 * Risposta ai messaggi che l'assistente non sa leggere.
 *
 * Modulo puro, così la regola anti-ripetizione — che è la parte delicata — si
 * verifica senza database.
 *
 * Su WhatsApp è normale mandare la foto della cucina, la posizione
 * dell'immobile o una scheda contatto. Finora quei messaggi sparivano in
 * silenzio: il cliente aveva scritto, l'assistente non rispondeva, e la
 * conclusione naturale è che il numero non sia attivo.
 */

/** Forma di cortesia: qui parla l'agenzia al proprio cliente (CLAUDE.md §1). */
export const MEDIA_NUDGE =
  "Grazie per il messaggio! Non riesco a visualizzare foto, documenti o posizioni in questa conversazione. Può scrivermi in un messaggio di testo, oppure mandarmi un vocale?";

/** Tipi di messaggio che sappiamo trattare. Tutto il resto passa da qui. */
export const HANDLED_MESSAGE_TYPES = ["text", "audio"] as const;

export function isHandledMessageType(type: string): boolean {
  return (HANDLED_MESSAGE_TYPES as readonly string[]).includes(type);
}

/**
 * Vero se conviene mandare l'invito a scrivere.
 *
 * Non si ripete se l'assistente l'ha già detto per ultimo: chi manda cinque
 * foto di fila riceverebbe cinque volte la stessa frase, e a quel punto è
 * l'assistente a sembrare rotto. Una volta sola, poi silenzio finché il
 * cliente non torna a scrivere davvero.
 */
export function shouldSendMediaNudge(history: ChatMessage[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    if (!message) continue;

    // Si guarda solo l'ultimo messaggio dell'assistente: se dopo l'invito il
    // cliente ha scritto qualcosa, l'invito si può rifare.
    if (message.sender === "bot") {
      return message.text !== MEDIA_NUDGE;
    }
  }

  // Nessuna risposta dell'assistente in archivio: si può invitare.
  return true;
}
