"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Percent, RefreshCw, Send, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface Match {
  id: string;
  score: number;
  reasons: string[];
  seenAt: string | null;
  notifiedAt: string | null;
  lead: {
    id: string;
    clientName: string;
    qualificationStatus: string;
    preferredZone: string | null;
    budgetMax: number | null;
  };
}

type Variante = "proposta" | "prospetto";

interface Preview {
  preview: string;
  variant: Variante;
  optedOut: boolean;
  alreadyNotifiedAt: string | null;
}

const euro = (v: number) => new Intl.NumberFormat("it-IT").format(v);

/**
 * Lead compatibili con un lotto, e invio della proposta.
 *
 * # L'anteprima non è una cortesia
 *
 * Quello che si vede prima di confermare arriva dal server ed è lo stesso
 * testo che parte: `buildRadarProposal` è chiamata sia qui sia nell'invio.
 * Comporre l'anteprima nel browser vorrebbe dire mostrare una cosa e
 * spedirne un'altra il giorno in cui una delle due cambia — e su un messaggio
 * che esce a nome dell'agenzia non è un dettaglio.
 */
export function RadarMatchesCard({
  radarPropertyId,
  roiDisponibile = false,
}: {
  radarPropertyId: string;
  /** Vero quando il simulatore ha almeno margine o rendimento da comunicare. */
  roiDisponibile?: boolean;
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<{ match: Match; data: Preview; variant: Variante } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/radar/properties/${radarPropertyId}/matches`);
      if (!response.ok) throw new Error();
      const data: { matches: Match[] } = await response.json();
      setMatches(data.matches);
      setError(null);
    } catch {
      setError("Non è stato possibile caricare gli abbinamenti.");
    } finally {
      setIsLoading(false);
    }
  }, [radarPropertyId]);

  const scan = useCallback(async () => {
    setIsScanning(true);
    setError(null);
    try {
      const response = await fetch(`/api/radar/properties/${radarPropertyId}/matches`, {
        method: "POST",
      });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      setError("Il calcolo degli abbinamenti non è riuscito.");
    } finally {
      setIsScanning(false);
    }
  }, [load, radarPropertyId]);

  /**
   * Ricalcolo automatico all'apertura della scheda.
   *
   * # Perché l'ordine è questo e non l'inverso
   *
   * Prima la lettura di quello che c'è già, poi il ricalcolo. Invertendoli
   * l'agente resterebbe davanti a un pannello vuoto per tutta la durata della
   * scansione, che interroga ogni lead dell'agenzia: vede subito gli
   * abbinamenti noti, e si aggiornano sotto.
   *
   * # Perché una volta sola per lotto
   *
   * La scheda si monta a ogni clic sulla linguetta, e senza guardia passare
   * avanti e indietro fra le tre schede lancerebbe una scansione completa a
   * ogni passaggio. Il riferimento tiene l'id del lotto, non un booleano:
   * aprendo un altro lotto la scansione deve ripartire, ed è la stessa
   * distinzione che separa "già fatto" da "già fatto per questo".
   *
   * Il pulsante resta: è la strada per rileggere dopo aver modificato un
   * lead o il prezzo del lotto, senza chiudere e riaprire la scheda.
   */
  const lottoGiaScansionato = useRef<string | null>(null);

  useEffect(() => {
    if (lottoGiaScansionato.current === radarPropertyId) return;
    lottoGiaScansionato.current = radarPropertyId;

    void (async () => {
      await load();
      await scan();
    })();
  }, [load, scan, radarPropertyId]);

  async function openPreview(match: Match, variant: Variante) {
    setSendError(null);
    try {
      const response = await fetch(`/api/radar/matches/${match.id}/notify?variant=${variant}`);
      if (!response.ok) throw new Error();
      setPreview({ match, data: await response.json(), variant });
    } catch {
      setError("Anteprima non disponibile.");
    }
  }

  async function confirmSend() {
    if (!preview || isSending) return;
    setIsSending(true);
    setSendError(null);

    try {
      const response = await fetch(`/api/radar/matches/${preview.match.id}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // La conferma viaggia nel corpo: la rotta rifiuta un invio che non la
        // porta, così una chiamata partita per sbaglio non scrive a nessuno.
        body: JSON.stringify({ confirm: true, variant: preview.variant }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setSendError(body?.message ?? `Invio non riuscito (errore ${response.status}).`);
        return;
      }

      setPreview(null);
      await load();
    } catch {
      setSendError("Errore di rete. Il messaggio non è stato inviato.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          Lead compatibili
        </h3>
        <button
          type="button"
          onClick={scan}
          disabled={isScanning}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted disabled:opacity-50"
        >
          {isScanning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Cerca abbinamenti
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-status-blocked">
          {error}
        </p>
      )}

      {isLoading && <p className="mt-2 text-xs text-muted-foreground">Caricamento…</p>}

      {/* Lo stato vuoto tace finché la scansione non è finita: comparire
          durante il ricalcolo automatico direbbe "nessun lead compatibile"
          proprio mentre li stiamo cercando. */}
      {!isLoading && !isScanning && matches.length === 0 && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Nessun lead compatibile. L&apos;incrocio con i contatti in pipeline considera solo
          quelli con almeno un criterio fra budget, zona e tipologia: se la pipeline è ancora
          vuota, o nessuno rientra nei parametri di questo lotto, qui non compare nulla.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {matches.map((match) => (
          <div
            key={match.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {match.lead.clientName}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    match.score >= 80
                      ? "bg-status-qualified/10 text-status-qualified"
                      : "bg-status-pending/10 text-status-pending"
                  )}
                >
                  {match.score}/100
                </span>
                {match.notifiedAt && (
                  // Con la data, non solo "inviata": senza, chi riapre la
                  // scheda dopo due settimane non sa se ha scritto ieri o il
                  // mese scorso, e nel dubbio riscrive.
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 text-status-qualified" />
                    Proposta inviata il{" "}
                    {new Date(match.notifiedAt).toLocaleDateString("it-IT", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>

              <ul className="mt-1 space-y-0.5">
                {match.reasons.map((r) => (
                  <li key={r} className="text-xs text-muted-foreground">
                    · {r}
                  </li>
                ))}
              </ul>

              {match.lead.budgetMax && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Budget dichiarato fino a {euro(match.lead.budgetMax)} €
                  {match.lead.preferredZone ? ` · cerca a ${match.lead.preferredZone}` : ""}
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openPreview(match, "proposta")}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
              >
                <Send className="h-3.5 w-3.5" />
                {match.notifiedAt ? "Invia di nuovo" : "Invia proposta"}
              </button>

              {/* Il prospetto compare solo quando c'e' almeno un indice da
                  mostrare: un messaggio di soli costi senza margine ne'
                  rendimento non dice nulla a un investitore. */}
              {roiDisponibile && (
                <button
                  type="button"
                  onClick={() => openPreview(match, "prospetto")}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
                >
                  <Percent className="h-3.5 w-3.5" />
                  Prospetto ROI
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* --- Anteprima e conferma --- */}
      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Anteprima del messaggio"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
        >
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-4 shadow-lg">
            <h4 className="text-sm font-semibold text-foreground">
              {preview.variant === "prospetto" ? "Prospetto ROI" : "Messaggio"} a{" "}
              {preview.match.lead.clientName}
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Questo è il testo esatto che verrà inviato. Nessun messaggio parte senza la tua
              conferma.
            </p>

            <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 font-sans text-sm leading-relaxed text-foreground">
              {preview.data.preview}
            </pre>

            {preview.data.optedOut && (
              <p className="mt-2 text-xs text-status-blocked">
                Questo contatto ha revocato il consenso: l&apos;invio verrà rifiutato.
              </p>
            )}
            {preview.data.alreadyNotifiedAt && (
              <p className="mt-2 text-xs text-status-pending">
                Una proposta per questo lotto è già stata inviata il{" "}
                {new Date(preview.data.alreadyNotifiedAt).toLocaleDateString("it-IT")}.
              </p>
            )}
            {sendError && (
              <p role="alert" className="mt-2 text-xs text-status-blocked">
                {sendError}
              </p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="h-9 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={confirmSend}
                disabled={isSending || preview.data.optedOut}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-gradient px-3 text-xs font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 disabled:opacity-50"
              >
                {isSending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Conferma e invia
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
