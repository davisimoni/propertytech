"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Instagram, Loader2, Send, Share2, X } from "lucide-react";
import type { SocialConnectionStatus } from "@/components/settings/social-connect-panel";
import { cn } from "@/lib/utils";

/**
 * Pubblicazione del post generato su Facebook e Instagram.
 *
 * # Perché il pulsante c'è anche senza collegamento
 *
 * Perché nasconderlo lascerebbe l'agenzia senza sapere che la funzione esiste:
 * chi non ha mai collegato la Pagina non va a cercarla nelle impostazioni di
 * un prodotto che non gli ha mai detto di averla. Il pulsante c'è, e chi lo
 * preme senza collegamento trova la strada per farlo, non un errore.
 */

interface EsitoPubblicazione {
  target: "facebook" | "instagram";
  ok: boolean;
  postId?: string;
  error?: string;
}

export function PublishButton({ testo }: { testo: string }) {
  const [stato, setStato] = useState<SocialConnectionStatus | null>(null);
  const [mostraGuida, setMostraGuida] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [esiti, setEsiti] = useState<EsitoPubblicazione[] | null>(null);

  useEffect(() => {
    fetch("/api/social/connection")
      .then((r) => (r.ok ? r.json() : null))
      .then((dati) => setStato(dati))
      // Silenzio: senza stato il pulsante si comporta come "non collegato",
      // che è l'ipotesi prudente — al massimo mostra la guida a chi era già
      // collegato, invece di far fallire una pubblicazione.
      .catch(() => setStato(null));
  }, []);

  async function pubblica() {
    if (!stato?.connected) {
      setMostraGuida(true);
      return;
    }

    setInCorso(true);
    setEsiti(null);

    try {
      /*
       * Solo Facebook, per ora.
       *
       * Instagram richiede un'immagine a un URL pubblico, e da questa
       * schermata un'immagine non c'è: il post è testo appena generato.
       * Chiederlo lo stesso produrrebbe un errore garantito su un canale che
       * l'agente ha visto elencato — peggio che non offrirlo.
       */
      const response = await fetch("/api/social/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testo, targets: ["facebook"] }),
      });

      const body = await response.json();

      if (!response.ok) {
        setEsiti([
          { target: "facebook", ok: false, error: body.message ?? "Pubblicazione non riuscita." },
        ]);
        return;
      }

      setEsiti(body.results as EsitoPubblicazione[]);
    } catch {
      setEsiti([{ target: "facebook", ok: false, error: "Errore di rete." }]);
    } finally {
      setInCorso(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={pubblica}
        disabled={inCorso}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted disabled:opacity-50 sm:h-8"
      >
        {inCorso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        Pubblica su Facebook/Instagram
      </button>

      {esiti && (
        <div className="mt-2 w-full space-y-1">
          {esiti.map((esito) => (
            <p
              key={esito.target}
              className={cn(
                "text-xs",
                esito.ok ? "text-status-qualified" : "text-status-blocked"
              )}
            >
              {esito.ok
                ? `Pubblicato su ${esito.target === "facebook" ? "Facebook" : "Instagram"}.`
                : esito.error}
            </p>
          ))}
        </div>
      )}

      {/* --- Guida al collegamento --- */}
      {mostraGuida && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Collega i social"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
        >
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Share2 className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Collega prima i tuoi social
                </h3>
              </div>
              {/* Chiudibile, a differenza del modale dei limiti di piano: qui
                  non c'e' niente da pagare, e chi voleva solo copiare il testo
                  deve poter tornare indietro. */}
              <button
                type="button"
                onClick={() => setMostraGuida(false)}
                aria-label="Chiudi"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              Per pubblicare direttamente serve collegare una volta sola la Pagina Facebook
              dell&apos;agenzia. Il profilo Instagram Business agganciato alla Pagina viene
              collegato insieme.
            </p>

            <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              <li>1. Vai in Impostazioni → Integrazioni.</li>
              <li>2. Premi «Connetti Pagina Facebook &amp; Instagram Business».</li>
              <li>3. Autorizza la Pagina dell&apos;agenzia dal dialogo Meta.</li>
            </ol>

            <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Instagram className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Su Instagram serve anche un&apos;immagine: l&apos;API non accetta post di solo testo.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link href="/settings?tab=integrations" className="btn-brand text-xs">
                <Share2 className="h-4 w-4" />
                Vai alle Impostazioni
              </Link>
              <button
                type="button"
                onClick={() => setMostraGuida(false)}
                className="btn-outline text-xs"
              >
                Copio il testo a mano
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Badge discreto in /social: dice se si può pubblicare senza aprire nulla. */
export function SocialConnectionBadge() {
  const [stato, setStato] = useState<SocialConnectionStatus | null>(null);

  useEffect(() => {
    fetch("/api/social/connection")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStato)
      .catch(() => setStato(null));
  }, []);

  if (!stato) return null;

  if (stato.connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-status-qualified/10 px-2.5 py-1 text-xs font-medium text-status-qualified">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {stato.facebookPageName}
        {stato.instagramUsername ? ` · @${stato.instagramUsername}` : ""}
      </span>
    );
  }

  return (
    <Link
      href="/settings?tab=integrations"
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
    >
      <Share2 className="h-3.5 w-3.5" />
      Social non collegati
    </Link>
  );
}
