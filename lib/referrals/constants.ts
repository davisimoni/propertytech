/**
 * Costanti del Programma Referral condivise fra client e server.
 *
 * Modulo client-safe di proposito (niente `server-only`): le percentuali
 * servono anche al popup promozionale, che gira nel browser e non può
 * importare `lib/billing/stripe.ts`. Restano dichiarate qui una sola volta e
 * `lib/billing/stripe.ts` le riespone, così non esistono due valori da tenere
 * allineati a mano.
 */

/**
 * Nome del cookie che porta il codice referral attraverso il flusso di
 * registrazione — incluso il redirect OAuth di Google, che non lascia
 * passare un campo di form. Lo usano sia la pagina di registrazione (per
 * scriverlo) sia le rotte server (per leggerlo).
 */
export const REFERRAL_COOKIE_NAME = "propertytech_ref";

/**
 * Sconto fisso, ricorrente per sempre, dello stesso Programma Referral:
 * niente più somma per numero di referral attivi. Vale identico per
 * l'invitante e per l'agenzia invitata (Win-Win) — un solo numero, non due
 * costanti da tenere in sincronia come nella versione precedente.
 */
export const REFERRAL_DISCOUNT_PERCENT = 20;

/**
 * Chiave `localStorage` con l'istante dell'ultima apparizione automatica del
 * popup promozionale, e intervallo minimo prima di riproporlo.
 *
 * Quattro giorni: un promemoria periodico è utile, uno a ogni visita è un
 * motivo per abbandonare il sito. Applicato per confronto diretto sul
 * timestamp salvato: non serve una migrazione per chi aveva già visto il
 * popup sotto la vecchia soglia di sette giorni, il nuovo valore più corto
 * si applica al primo controllo successivo.
 */
export const REFERRAL_POPUP_STORAGE_KEY = "referral_popup_last_seen";
export const REFERRAL_POPUP_INTERVAL_MS = 4 * 24 * 60 * 60 * 1000;

/** Ritardo prima dell'apertura automatica: il tempo di far leggere la pagina. */
export const REFERRAL_POPUP_DELAY_MS = 10_000;

/**
 * Evento DOM con cui il link nel footer chiede al popup di aprirsi.
 *
 * Un evento e non un context: il footer è un server component montato in
 * alberi diversi (landing, guida, pagine legali) e avvolgere l'intera app in
 * un provider solo per aprire un modale sarebbe sproporzionato.
 */
export const REFERRAL_POPUP_OPEN_EVENT = "propertytech:open-referral";
