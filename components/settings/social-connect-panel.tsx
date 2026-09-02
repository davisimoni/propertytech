"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserRole } from "@prisma/client";
import { CheckCircle2, Instagram, Loader2, Share2, Unlink } from "lucide-react";
import { useToast } from "@/components/shared/toast-provider";

export interface SocialConnectionStatus {
  connected: boolean;
  facebookPageName: string | null;
  instagramUsername: string | null;
  configured: boolean;
}

/**
 * Collegamento della Pagina Facebook e del profilo Instagram dell'agenzia.
 *
 * # Perché lo stato dice A COSA si è connessi
 *
 * Un "Connesso" verde da solo non permette di accorgersi che il consenso è
 * andato sulla pagina personale invece che su quella dell'agenzia — un errore
 * frequente, perché il dialogo Meta le mostra insieme. Il nome della Pagina e
 * lo username Instagram sono l'unico modo di verificarlo prima di pubblicare.
 */
export function SocialConnectPanel({ currentRole }: { currentRole: UserRole }) {
  const [stato, setStato] = useState<SocialConnectionStatus | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const isOwner = currentRole === "OWNER";

  const carica = useCallback(async () => {
    try {
      const response = await fetch("/api/social/connection");
      if (!response.ok) return;
      setStato((await response.json()) as SocialConnectionStatus);
    } catch {
      // Silenzio: il pannello resta nello stato precedente invece di
      // annunciare un guasto per una lettura non riuscita.
    }
  }, []);

  useEffect(() => {
    void carica();
  }, [carica]);

  /*
   * Esito del ritorno da Meta, letto dall'indirizzo.
   *
   * Il callback rimanda qui con `?social=`: senza questa lettura l'agente
   * tornerebbe su una pagina identica a prima, senza sapere se il consenso ha
   * funzionato. Il parametro si toglie subito dopo, o un ricaricamento
   * ripeterebbe il messaggio.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const esito = params.get("social");
    if (!esito) return;

    const messaggi: Record<string, { testo: string; tipo: "success" | "error" }> = {
      connesso: { testo: "Pagina collegata.", tipo: "success" },
      annullato: { testo: "Collegamento annullato.", tipo: "error" },
      "nessuna-pagina": {
        testo: "Nessuna Pagina Facebook trovata su quell'account.",
        tipo: "error",
      },
      errore: { testo: "Collegamento non riuscito. Riprova.", tipo: "error" },
    };

    const messaggio = messaggi[esito];
    if (messaggio) showToast(messaggio.testo, messaggio.tipo);

    params.delete("social");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);

    void carica();
  }, [carica, showToast]);

  async function collega() {
    setInCorso(true);
    setError(null);

    try {
      const response = await fetch("/api/social/meta/start");
      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "Non è stato possibile avviare il collegamento.");
        return;
      }

      // Fuori dalla nostra app: il consenso lo dà su facebook.com e torna al
      // callback, che rimanda qui.
      window.location.href = body.url as string;
    } catch {
      setError("Errore di rete.");
    } finally {
      setInCorso(false);
    }
  }

  async function scollega() {
    setInCorso(true);
    setError(null);

    try {
      const response = await fetch("/api/social/connection", { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.message ?? "Non è stato possibile scollegare.");
        return;
      }
      await carica();
      showToast("Pagina scollegata.", "success");
    } catch {
      setError("Errore di rete.");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Share2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Integrazioni Social Media</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Collega la Pagina Facebook dell&apos;agenzia per pubblicare i post generati senza
            copiarli a mano. Il profilo Instagram Business agganciato alla Pagina viene collegato
            insieme.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
        {stato?.connected ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-status-qualified">
              <CheckCircle2 className="h-4 w-4" />
              Connesso a: {stato.facebookPageName}
            </span>
            {stato.instagramUsername ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Instagram className="h-3.5 w-3.5" />@{stato.instagramUsername}
              </span>
            ) : (
              /* Detto e non taciuto: su Instagram non si pubblica finché il
                 profilo non è agganciato alla Pagina, e l'agente lo scoprirebbe
                 al primo post fallito. */
              <span className="text-xs text-muted-foreground">
                Nessun profilo Instagram Business collegato a questa Pagina.
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Non connesso</p>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs text-status-blocked">
          {error}
        </p>
      )}

      {isOwner ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {stato?.connected ? (
            <button
              type="button"
              onClick={scollega}
              disabled={inCorso}
              className="btn-outline text-xs disabled:opacity-50"
            >
              {inCorso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
              Scollega
            </button>
          ) : (
            <button
              type="button"
              onClick={collega}
              disabled={inCorso}
              className="btn-brand text-xs disabled:opacity-50"
            >
              {inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              Connetti Pagina Facebook &amp; Instagram Business
            </button>
          )}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Il collegamento lo gestisce il titolare dell&apos;agenzia.
        </p>
      )}

      {/* Dichiarato prima, non scoperto dopo: sono i due vincoli che
          sorprendono chiunque colleghi per la prima volta. */}
      <ul className="mt-4 space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
        <li>
          Serve una <strong className="font-medium text-foreground">Pagina Facebook</strong> (non un
          profilo personale) e, per Instagram, un account{" "}
          <strong className="font-medium text-foreground">Business</strong> collegato a quella
          Pagina.
        </li>
        <li>
          Su Instagram <strong className="font-medium text-foreground">non si pubblica solo
          testo</strong>: l&apos;API richiede un&apos;immagine. È un limite di Meta, non nostro.
        </li>
      </ul>
    </section>
  );
}
