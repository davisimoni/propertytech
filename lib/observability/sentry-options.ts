import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/**
 * Configurazione condivisa del tracciamento errori.
 *
 * # Perché un modulo e non tre copie
 *
 * Perché le inizializzazioni sono tre — client, server e edge — e le regole
 * che contano davvero sono le stesse per tutte: la regione di ingestione e
 * cosa non deve uscire da qui. Tre copie divergono, e a divergere sarebbe
 * proprio la ripulitura dei dati personali.
 *
 * # Senza DSN non fa niente, e non è un ripiego
 *
 * `enabled` è falso quando `SENTRY_DSN` manca. Inizializzare comunque
 * significherebbe accumulare eventi che nessuno riceve e pagare il costo del
 * wrapper a ogni richiesta. È la stessa scelta del seam STT e dei connettori
 * gestionale: configurato funziona, non configurato tace invece di fingere.
 */

/** Percentuale di transazioni tracciate. Gli ERRORI si inviano sempre. */
const TRACES_SAMPLE_RATE = 0.05;

/**
 * Chiavi il cui valore non esce mai da qui.
 *
 * Non è un elenco di cortesia: un payload di errore porta con sé il corpo
 * della richiesta che l'ha causato, e su questa piattaforma quel corpo
 * contiene nomi e numeri di telefono di clienti finali, token di terze parti
 * e testo di conversazioni WhatsApp. Un servizio di monitoraggio non è un
 * destinatario legittimo di nessuna di queste cose.
 */
const CHIAVI_DA_OSCURARE = [
  "authorization",
  "cookie",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "password",
  "apikey",
  "clientphone",
  "clientname",
  "phone",
  "telefono",
  "email",
  "message",
  "messages",
  "text",
  "rawtext",
  "dataurl",
  "transcript",
  "notes",
];

const OSCURATO = "[rimosso]";

function vaOscurata(chiave: string): boolean {
  const k = chiave.toLowerCase();
  return CHIAVI_DA_OSCURARE.some((sospetta) => k.includes(sospetta));
}

/**
 * Sostituisce ricorsivamente i valori delle chiavi sensibili.
 *
 * Profondità limitata: un oggetto molto annidato o con un ciclo non deve
 * trasformare la ripulitura in un blocco del processo proprio mentre si sta
 * gestendo un errore.
 */
export function scrub(valore: unknown, profondita = 0): unknown {
  if (valore === null || typeof valore !== "object") return valore;

  /*
   * Oltre il limite si tronca, NON si lascia passare il valore grezzo.
   *
   * Restituire l'oggetto intatto sembrava innocuo e non lo era: una chiave
   * sensibile annidata piu' in fondo del limite sarebbe uscita in chiaro,
   * cioe' esattamente cio' che questa funzione esiste per impedire. Tronca
   * anche i riferimenti ciclici, che altrimenti sopravvivrebbero alla
   * ripulitura.
   */
  if (profondita > 6) return "[troncato]";

  if (Array.isArray(valore)) {
    return valore.slice(0, 50).map((v) => scrub(v, profondita + 1));
  }

  const risultato: Record<string, unknown> = {};
  for (const [chiave, v] of Object.entries(valore as Record<string, unknown>)) {
    risultato[chiave] = vaOscurata(chiave) ? OSCURATO : scrub(v, profondita + 1);
  }
  return risultato;
}

/**
 * Ultimo passaggio prima dell'invio.
 *
 * Toglie i dati personali dal corpo della richiesta e dai dati aggiuntivi, e
 * scarta l'indirizzo IP: identifica una persona e non serve a capire perché
 * una funzione è fallita.
 */
export function beforeSend(evento: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  if (evento.request) {
    delete evento.request.cookies;
    evento.request.headers = undefined;
    if (evento.request.data !== undefined) {
      evento.request.data = scrub(evento.request.data);
    }
    // La query string porta i token di ingestione dei portali (`?token=...`).
    if (evento.request.query_string !== undefined) {
      evento.request.query_string = OSCURATO;
    }
  }

  if (evento.extra) evento.extra = scrub(evento.extra) as Record<string, unknown>;
  if (evento.contexts) evento.contexts = scrub(evento.contexts) as typeof evento.contexts;

  // Resta l'id dell'agenzia dove qualcuno lo abbia impostato: serve a capire
  // se un guasto colpisce tutti o una sola organizzazione, e non identifica
  // una persona fisica.
  if (evento.user) {
    evento.user = { id: evento.user.id };
  }

  return evento;
}

export function sentryBaseOptions() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

  return {
    dsn,
    /*
     * Vincolo di residenza dei dati, non una preferenza.
     *
     * CLAUDE.md §5 impone che i dati personali restino nell'Unione Europea, e
     * un payload di errore ne contiene: per questo il DSN DEVE puntare alla
     * regione europea di Sentry (`ingest.de.sentry.io`). Un DSN statunitense
     * spedirebbe fuori dall'Unione esattamente i dati che il pin `fra1` in
     * vercel.json esiste per tenerci dentro.
     */
    enabled: Boolean(dsn),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    /*
     * `sendDefaultPii` esplicitamente falso.
     *
     * Il valore predefinito dell'SDK allega indirizzo IP e intestazioni della
     * richiesta. Su una piattaforma che tratta contatti di clienti finali per
     * conto di agenzie terze, quello non e' un dettaglio di configurazione.
     */
    sendDefaultPii: false,
    beforeSend,
  };
}
