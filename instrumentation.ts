import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Errori non gestiti delle rotte API e del rendering server.
 *
 * E' il gancio che copre i 500: le quaranta rotte che gia' fanno
 * `console.error` continuano a loggare su Vercel, ma un'eccezione che
 * sfugge del tutto — un parsing PDF che esplode, il modello che risponde in
 * un formato inatteso, il microservizio WhatsApp irraggiungibile — finora
 * lasciava una traccia solo nei log, senza aggregazione ne' avviso.
 */
export const onRequestError = Sentry.captureRequestError;
