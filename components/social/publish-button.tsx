"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Instagram, Loader2, Send, Share2, X } from "lucide-react";
import type { SocialConnectionStatus } from "@/components/settings/social-connect-panel";
import { kindFromExtension, type PubblicazioneCome } from "@/lib/social/media-limits";
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

export function PublishButton({ testo, media = [] }: { testo: string; media?: string[] }) {
  const [stato, setStato] = useState<SocialConnectionStatus | null>(null);
  const [mostraGuida, setMostraGuida] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [esiti, setEsiti] = useState<EsitoPubblicazione[] | null>(null);
  /*
   * Come pubblicare, quando ci sono foto **e** video.
   *
   * Predefinito il Reel: fra i due e' il formato che Meta spinge di piu', ed e'
   * anche quello che l'agente ha chiesto di piu' raramente per sbaglio — una
   * foto la si allega, un video lo si sceglie. La scelta resta visibile e
   * cambiabile prima di pubblicare, perche' scartare un allegato in silenzio
   * farebbe pubblicare una cosa diversa da quella che si stava guardando.
   */
  const [come, setCome] = useState<PubblicazioneCome>("reel");

  useEffect(() => {
    fetch("/api/social/connection")
      .then((r) => (r.ok ? r.json() : null))
      .then((dati) => setStato(dati))
      // Silenzio: senza stato il pulsante si comporta come "non collegato",
      // che è l'ipotesi prudente — al massimo mostra la guida a chi era già
      // collegato, invece di far fallire una pubblicazione.
      .catch(() => setStato(null));
  }, []);

  const video = media.filter((url) => kindFromExtension(url) === "video");
  const foto = media.filter((url) => kindFromExtension(url) !== "video");
  /*
   * Meta non pubblica post misti: un post e' un album di foto **oppure** un
   * video. Mandarli insieme fa rispondere "Media ID is not available", un
   * errore che non nomina la causa — ed e' il caso normale dopo una generazione
   * con i media attivi, che produce sempre una grafica e un video.
   */
  const daScegliere = video.length > 0 && foto.length > 0;

  async function pubblica() {
    if (!stato?.connected) {
      setMostraGuida(true);
      return;
    }

    setInCorso(true);
    setEsiti(null);

    try {
      /*
       * Instagram entra fra i canali solo con almeno un allegato.
       *
       * Vale per una foto come per un video: l'unica cosa che l'API rifiuta e'
       * il post di solo testo. Includerlo a vuoto produrrebbe un errore
       * garantito su un canale che l'agente ha visto elencato.
       */
      const targets = media.length > 0 ? ["facebook", "instagram"] : ["facebook"];

      const response = await fetch("/api/social/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: testo,
          mediaUrls: media,
          targets,
          // Solo quando serve: con un tipo solo non c'e' niente da scegliere, e
          // mandare una scelta a vuoto rischierebbe di scartare l'unico
          // allegato presente.
          ...(daScegliere ? { publishAs: come } : {}),
        }),
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
      {/*
        La scelta compare solo quando c'e' davvero, e prima del pulsante.
        Dopo sarebbe una spiegazione di cio' che e' gia' successo.
      */}
      {daScegliere && (
        <div className="mb-2 w-full rounded-lg border border-border bg-card p-2.5">
          <p className="text-xs font-medium text-foreground">
            Hai allegato foto e video: Meta pubblica l&apos;uno o l&apos;altro, non entrambi.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(
              [
                ["reel", `Reel dal video${video.length > 1 ? " (il primo)" : ""}`],
                ["foto", `Post con ${foto.length === 1 ? "la foto" : `le ${foto.length} foto`}`],
              ] as [PubblicazioneCome, string][]
            ).map(([valore, etichetta]) => (
              <button
                key={valore}
                type="button"
                onClick={() => setCome(valore)}
                aria-pressed={come === valore}
                className={cn(
                  "inline-flex h-11 items-center rounded-full px-3 text-xs font-medium transition-all duration-200 sm:h-8",
                  come === valore
                    ? "bg-brand-gradient text-white shadow-sm"
                    : "border border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {etichetta}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {come === "reel"
              ? "Le foto allegate restano qui, pronte per un secondo post."
              : "Il video allegato resta qui, pronto per un secondo post."}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={pubblica}
        disabled={inCorso}
        className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted disabled:opacity-50 sm:h-8"
      >
        {inCorso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        {media.length === 0
          ? "Pubblica su Facebook"
          : daScegliere
            ? come === "reel"
              ? "Pubblica il Reel su Facebook/Instagram"
              : "Pubblica le foto su Facebook/Instagram"
            : "Pubblica su Facebook/Instagram"}
      </button>

      {/* L'avviso invece del silenzio.

          Senza allegati il post parte lo stesso, ma solo su Facebook: dirlo
          prima evita che l'agente scopra dopo che su Instagram non e' comparso
          niente e pensi a un guasto. */}
      {media.length === 0 && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Instagram className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Allega almeno una foto o un video per pubblicare anche su Instagram: l&apos;API non
          accetta post di solo testo.
        </p>
      )}

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
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-8 sm:w-8"
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
      className="inline-flex min-h-11 md:mouse:min-h-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
    >
      <Share2 className="h-3.5 w-3.5" />
      Social non collegati
    </Link>
  );
}
