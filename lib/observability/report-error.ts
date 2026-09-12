import * as Sentry from "@sentry/nextjs";

/**
 * Manda a Sentry un errore che il codice ha già gestito.
 *
 * # Perché serve una funzione, e non basta Sentry
 *
 * Perché Sentry cattura da solo le eccezioni **non gestite**, e qui non ce
 * ne sono: ogni chiamata al modello è avvolta da un `catch` che restituisce
 * all'agente un messaggio comprensibile. È la cosa giusta per chi usa il
 * prodotto, ma significa che un guasto del fornitore AI non lasciava altra
 * traccia che una riga nei log di Vercel, che nessuno conta e su cui nessuno
 * riceve un avviso.
 *
 * # Perché solo etichette, e nessun payload
 *
 * Perché su questa piattaforma il contenuto di un'elaborazione è una perizia
 * giudiziaria, una visura con nomi e codici fiscali, o la nota vocale di una
 * visita. Allegare il documento all'evento di errore manderebbe fuori
 * esattamente i dati che `beforeSend` in `sentry-options.ts` esiste per
 * togliere. Le etichette dicono **dove** è successo, che è ciò che serve per
 * accorgersene; il **cosa** resta nel database dell'agenzia.
 *
 * Senza DSN configurato questa chiamata non spedisce nulla e non costa niente
 * (vedi `sentryBaseOptions`), quindi può stare anche nei percorsi caldi.
 */
export function reportAiError(error: unknown, modulo: string): void {
  Sentry.captureException(error, { tags: { area: "ai", modulo } });
}
