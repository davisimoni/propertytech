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

/**
 * Manda a Sentry un guasto di un webhook transazionale.
 *
 * # Perché i webhook a parte
 *
 * Perché qui l'errore non lo vede nessuno, per costruzione: dall'altro capo
 * c'è Stripe o Meta, non una persona davanti a una schermata. Un `catch` che
 * si limita a un `console.error` trasforma un pagamento non registrato o una
 * risposta mai inviata in una riga d'archivio che nessuno legge.
 *
 * Stessa regola dei percorsi AI — **solo etichette, nessun payload**, e qui
 * pesa di più: il corpo di un webhook WhatsApp contiene il numero e il testo
 * di un cliente finale, quello di Stripe gli identificativi del cliente
 * pagante. Nessuno dei due è un dato che un servizio di monitoraggio debba
 * ricevere.
 *
 * `dettaglio` è per distinguere *dove* dentro lo stesso webhook (quale evento
 * Stripe, quale passaggio): resta un'etichetta breve e non un contenuto.
 */
export function reportWebhookError(
  error: unknown,
  webhook: string,
  dettaglio?: string
): void {
  Sentry.captureException(error, {
    tags: { area: "webhook", webhook, ...(dettaglio ? { dettaglio } : {}) },
  });
}

/**
 * Manda a Sentry un guasto nella registrazione di un addebito.
 *
 * Separato dai webhook perché qui il danno ha un segno preciso: un consumo
 * che non arriva a Stripe è un importo che l'agenzia non pagherà mai, e
 * nessuno se ne accorge guardando il prodotto — funziona tutto, manca solo
 * una riga in fattura. Stesse regole: solo etichette, nessun dato del cliente.
 */
export function reportBillingError(error: unknown, passaggio: string): void {
  Sentry.captureException(error, { tags: { area: "billing", passaggio } });
}
