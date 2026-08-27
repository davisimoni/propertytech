"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarSync, Check, Loader2, Unplug } from "lucide-react";
import type {
  CalendarConnectionsResponse,
  CalendarConnectionView,
} from "@/app/api/calendar/connections/route";
import { cn } from "@/lib/utils";

type ProviderId = CalendarConnectionView["provider"];

/**
 * I due fornitori sono un dato **statico**, non il risultato della chiamata a
 * `/api/calendar/connections`.
 *
 * Disegnarli a partire dalla risposta significava che una fetch fallita —
 * rete assente, sessione scaduta, 500 momentaneo — lasciava la scheda
 * completamente vuota: nessun pulsante e nemmeno un errore, solo il titolo.
 * L'elenco dei calendari collegabili non cambia a runtime, quindi non deve
 * dipendere da una risposta del server per esistere: quella serve solo a dire
 * *se* sono già collegati.
 */
const PROVIDERS: ProviderId[] = ["google", "outlook"];

const PROVIDER_LABELS: Record<ProviderId, string> = {
  google: "Google Calendar",
  outlook: "Microsoft Outlook / Office 365",
};

/** Etichetta del pulsante di collegamento, come richiesta nella scheda. */
const CONNECT_LABELS: Record<ProviderId, string> = {
  google: "Connetti Google Calendar",
  outlook: "Connetti Microsoft Outlook / Office 365",
};

/**
 * Logo Google ufficiale.
 *
 * Inline e non da un CDN: la pagina è dietro autenticazione e non deve
 * dipendere da un host esterno per disegnare un pulsante — oltre a evitare
 * una richiesta che racconterebbe a terzi quando un agente apre le proprie
 * impostazioni.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** Logo Outlook ufficiale, stesso principio del precedente. */
function OutlookMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path fill="#0364B8" d="M28 12h18v20a2 2 0 0 1-2 2H28z" />
      <path fill="#0078D4" d="M28 12h18v10H28z" />
      <path fill="#28A8EA" d="M28 22h18v10H28z" />
      <path fill="#14447D" d="M2 8.5 26 5v38L2 39.5z" />
      <path
        fill="#fff"
        d="M14 17.4c-3.3 0-5.6 2.7-5.6 6.6s2.3 6.6 5.6 6.6 5.6-2.7 5.6-6.6-2.3-6.6-5.6-6.6zm0 10.7c-1.7 0-2.8-1.6-2.8-4.1s1.1-4.1 2.8-4.1 2.8 1.6 2.8 4.1-1.1 4.1-2.8 4.1z"
      />
    </svg>
  );
}

const PROVIDER_MARKS: Record<ProviderId, () => React.JSX.Element> = {
  google: GoogleMark,
  outlook: OutlookMark,
};

/** Esiti del ritorno da OAuth, letti da `?calendar=` (vedi lib/calendar/oauth-handlers.ts). */
const OUTCOME_MESSAGES: Record<string, { tone: "ok" | "error"; text: string }> = {
  connected: { tone: "ok", text: "Calendario collegato correttamente." },
  cancelled: { tone: "error", text: "Collegamento annullato: nessun calendario è stato connesso." },
  invalid_state: {
    tone: "error",
    text: "Sessione di collegamento scaduta o non valida. Riprova dal pulsante qui sotto.",
  },
  not_configured: {
    tone: "error",
    text:
      "Integrazione non ancora attiva: le credenziali di questo calendario non sono configurate sul server. Il collegamento sarà disponibile appena vengono aggiunte.",
  },
  MissingGoogleCredentials: {
    tone: "error",
    text:
      "Google Calendar non è ancora attivabile: mancano GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CLIENT_ID (e il rispettivo secret) sul server.",
  },
  MissingOutlookCredentials: {
    tone: "error",
    text:
      "Microsoft Outlook non è ancora attivabile: mancano MICROSOFT_CLIENT_ID e MICROSOFT_CLIENT_SECRET sul server.",
  },
  encryption_unavailable: {
    tone: "error",
    text:
      "Cifratura non disponibile sul server: il collegamento non è stato avviato, per non salvare i token in chiaro.",
  },
  token_exchange_failed: {
    tone: "error",
    text: "Il fornitore non ha confermato il collegamento. Riprova fra qualche minuto.",
  },
};

/**
 * "Sincronizzazione Calendari Esterni" in /settings/calendar.
 *
 * Mostra lo stato per ciascun fornitore e avvia il consenso OAuth. Il
 * collegamento è **per agente**, non per agenzia: il calendario è quello
 * personale di chi lo collega, e la scheda lo dice esplicitamente — due
 * collaboratori che vedessero "connesso" senza capire di chi sarebbe la
 * premessa di un doppio invio di appuntamenti sull'agenda sbagliata.
 */
export function ExternalCalendarSync() {
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<CalendarConnectionView[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);

  // Due parametri con due significati distinti: `?calendar=` è l'esito del
  // flusso OAuth (connesso, annullato, stato scaduto), `?error=` dice che il
  // fornitore non è attivabile e *quale* credenziale manca. Entrambi finiscono
  // nello stesso avviso in cima alla scheda.
  const outcome = searchParams.get("calendar") ?? searchParams.get("error");
  const outcomeMessage = outcome ? OUTCOME_MESSAGES[outcome] : undefined;

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/calendar/connections");
      const data: CalendarConnectionsResponse | null = response.ok ? await response.json() : null;
      if (data) setConnections(data.connections);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function disconnect(provider: CalendarConnectionView["provider"]) {
    setPending(provider);
    try {
      await fetch(`/api/calendar/connections?provider=${provider}`, { method: "DELETE" });
      await load();
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CalendarSync className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Sincronizzazione Calendari Esterni
          </h2>
          <p className="text-sm text-muted-foreground">
            Collega il <span className="font-medium">tuo</span> calendario: gli slot che si
            sovrappongono a un impegno reale non vengono più proposti, e le visite fissate
            dall&apos;assistente WhatsApp compaiono automaticamente in agenda.
          </p>
        </div>
      </div>

      {outcomeMessage && (
        <p
          role="status"
          className={cn(
            "mt-4 rounded-lg border p-3 text-sm",
            outcomeMessage.tone === "ok"
              ? "border-status-qualified/30 bg-status-qualified/10 text-foreground"
              : "border-status-pending/30 bg-status-pending/10 text-foreground"
          )}
        >
          {outcomeMessage.text}
        </p>
      )}

      {/* La griglia è sempre montata: `isLoading` fa comparire un indicatore
          accanto allo stato, non sostituisce l'intera scheda con uno
          scheletro. I due pulsanti restano visibili e cliccabili dal primo
          istante, anche mentre si sta ancora leggendo lo stato dal server. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {PROVIDERS.map((provider) => {
          const Mark = PROVIDER_MARKS[provider];
          const state = connections?.find((item) => item.provider === provider);
          const isConnected = Boolean(state?.accountEmail);
          // Distinto da `=== false`: finché lo stato non è arrivato (o la
          // fetch è fallita) non si può affermare che *non* sia configurato,
          // e mostrare l'avviso sarebbe una diagnosi inventata.
          const isKnownUnconfigured = state?.isConfigured === false;

          return (
            <div key={provider} className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <Mark />
                <span className="text-sm font-medium text-foreground">
                  {PROVIDER_LABELS[provider]}
                </span>
              </div>

              {isConnected ? (
                <>
                  <p className="flex items-start gap-1.5 text-xs text-status-qualified">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {/* `break-all`: un indirizzo lungo non deve sfondare la
                        colonna su schermo stretto. */}
                    <span className="min-w-0 break-all">Connesso come {state?.accountEmail}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => disconnect(provider)}
                    disabled={pending === provider}
                    className="inline-flex w-fit items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted disabled:opacity-50"
                  >
                    {pending === provider ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Unplug className="h-3.5 w-3.5" />
                    )}
                    Disconnetti
                  </button>
                </>
              ) : (
                <>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {isLoading && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                    {isLoading ? "Verifica dello stato…" : "Non connesso"}
                  </p>

                  {/* Un link e non una fetch: il consenso OAuth è una
                      navigazione verso il fornitore, e intercettarla in
                      JavaScript la romperebbe dentro un iframe o con i popup
                      bloccati. Resta un link anche quando le credenziali
                      mancano: la rotta di connessione rimanda qui con
                      `?calendar=not_configured` e l'avviso in cima alla
                      scheda spiega cosa manca — meglio di un pulsante inerte
                      che sembra rotto. */}
                  <a
                    href={`/api/calendar/${provider}/connect`}
                    className="inline-flex w-fit items-center gap-2 rounded-lg border border-border-strong bg-background px-3 py-2 text-xs font-medium text-foreground shadow-sm transition-all duration-200 hover:border-primary/40 hover:bg-muted"
                  >
                    <Mark />
                    {CONNECT_LABELS[provider]}
                  </a>

                  {isKnownUnconfigured && (
                    <p className="flex items-start gap-1.5 text-[11px] text-status-pending">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                      Integrazione in fase di attivazione: credenziali non ancora configurate sul
                      server.
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
