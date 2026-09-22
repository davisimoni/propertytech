"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ExternalLink,
  Eye,
  EyeOff,
  Facebook,
  Instagram,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { UpgradeLimitModal } from "@/components/billing/upgrade-limit-modal";
import { AI_DISCLAIMER } from "@/lib/compliance";
import { cn } from "@/lib/utils";

/**
 * Commenti dei post Instagram e della Pagina Facebook: leggere, rispondere,
 * moderare.
 *
 * # Cosa fa fare, e in che ordine
 *
 * Si apre sui post recenti perché è così che un agente cerca: ricorda il
 * post, non l'id del commento. Scelto il post arrivano i suoi commenti, e
 * ogni commento ha accanto le due sole azioni che servono davvero —
 * rispondere e nascondere.
 *
 * # Una scheda sola con un selettore, non due schede
 *
 * Perché il gesto è lo stesso su entrambe le piattaforme: qualcuno ha scritto
 * sotto un mio post, gli rispondo. Due schede nella barra in alto
 * costringerebbero a scegliere la piattaforma prima di sapere dove sono
 * arrivati i commenti, e su un telefono sarebbero due etichette in più in una
 * riga che già scorre.
 *
 * # Perché l'AI scrive ma non pubblica
 *
 * Il pulsante dell'AI riempie la casella, non spedisce. Una risposta finisce
 * sotto un post pubblico a nome dell'agenzia e non si richiama: chi la manda
 * deve averla letta. È anche la ragione per cui il testo resta modificabile
 * fino all'ultimo, invece di essere un messaggio "approva o rifiuta".
 */

type Piattaforma = "instagram" | "facebook";

const PIATTAFORME: { id: Piattaforma; label: string; icona: typeof Instagram }[] = [
  { id: "instagram", label: "Instagram", icona: Instagram },
  { id: "facebook", label: "Facebook", icona: Facebook },
];

interface PostSocial {
  id: string;
  piattaforma: Piattaforma;
  didascalia: string | null;
  anteprima: string | null;
  permalink: string | null;
  pubblicatoIl: string | null;
  commenti: number;
}

interface RispostaCommento {
  id: string;
  testo: string;
  autore: string;
  scrittoIl: string | null;
}

interface CommentoSocial {
  id: string;
  testo: string;
  autore: string;
  scrittoIl: string | null;
  nascosto: boolean;
  risposte: RispostaCommento[];
}

interface Paywall {
  reason: "limit_reached" | "not_in_plan";
  requiredPlan?: string;
}

/** "3 ore fa" invece di una data: sotto un post conta da quanto aspetta. */
function quandoScritto(iso: string | null): string {
  if (!iso) return "";
  const istante = new Date(iso).getTime();
  if (Number.isNaN(istante)) return "";

  const minuti = Math.round((Date.now() - istante) / 60_000);
  if (minuti < 1) return "adesso";
  if (minuti < 60) return `${minuti} min fa`;

  const ore = Math.round(minuti / 60);
  if (ore < 24) return `${ore} ${ore === 1 ? "ora" : "ore"} fa`;

  const giorni = Math.round(ore / 24);
  if (giorni < 30) return `${giorni} ${giorni === 1 ? "giorno" : "giorni"} fa`;

  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

export function CommentsPanel() {
  const [piattaforma, setPiattaforma] = useState<Piattaforma>("instagram");
  const [post, setPost] = useState<PostSocial[] | null>(null);
  const [selezionato, setSelezionato] = useState<PostSocial | null>(null);
  const [commenti, setCommenti] = useState<CommentoSocial[] | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [caricamentoCommenti, setCaricamentoCommenti] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [paywall, setPaywall] = useState<Paywall | null>(null);
  const [paywallInline, setPaywallInline] = useState<Paywall | null>(null);

  /** Id del commento con la casella di risposta aperta. */
  const [inRisposta, setInRisposta] = useState<string | null>(null);
  const [bozza, setBozza] = useState("");
  const [bozzaDaAi, setBozzaDaAi] = useState(false);
  const [generazione, setGenerazione] = useState(false);
  const [invio, setInvio] = useState(false);
  const [azioneSuCommento, setAzioneSuCommento] = useState<string | null>(null);
  const [conferma, setConferma] = useState<string | null>(null);

  /**
   * Vero se la risposta è un paywall, e nel caso lo mette in scena.
   *
   * Due forme, come impone CLAUDE.md §"Fascicolo documentale": aprire una
   * scheda e trovarsi in trappola in un modale senza X è una punizione per
   * aver guardato, quindi in lettura si mostra un riquadro inline. Il modale
   * non chiudibile resta per il tentativo di scrivere, che è il momento in cui
   * l'agente sta davvero chiedendo la funzione.
   */
  const intercettaPaywall = useCallback(
    async (risposta: Response, bloccante: boolean): Promise<boolean> => {
      if (risposta.status !== 402) return false;
      const corpo = await risposta.json().catch(() => null);
      const dettaglio: Paywall =
        corpo?.error === "feature_not_in_plan"
          ? { reason: "not_in_plan", requiredPlan: corpo.requiredPlan }
          : { reason: "limit_reached" };

      if (bloccante) setPaywall(dettaglio);
      else setPaywallInline(dettaglio);
      return true;
    },
    []
  );

  const caricaPost = useCallback(async () => {
    setCaricamento(true);
    setErrore(null);

    try {
      const risposta = await fetch(`/api/social/comments?piattaforma=${piattaforma}`);
      if (await intercettaPaywall(risposta, false)) return;

      const corpo = await risposta.json().catch(() => null);
      if (!risposta.ok) {
        setErrore(corpo?.message ?? "Non riesco a leggere i post di Instagram.");
        return;
      }

      const elenco: PostSocial[] = corpo.posts ?? [];
      setPost(elenco);
      /*
       * Il primo post è già selezionato: aprire la scheda su una lista vuota
       * con scritto "scegli un post" è un passaggio in più per tutti, sempre.
       *
       * Cambiando piattaforma la selezione precedente non vale più: un post
       * Instagram resterebbe selezionato mentre l'elenco mostra quelli della
       * Pagina, e i commenti sotto sarebbero di un altro post.
       */
      setSelezionato((precedente) =>
        precedente && precedente.piattaforma === piattaforma ? precedente : (elenco[0] ?? null)
      );
    } catch {
      setErrore("Non riesco a contattare il server. Controlla la connessione.");
    } finally {
      setCaricamento(false);
    }
  }, [intercettaPaywall, piattaforma]);

  const caricaCommenti = useCallback(
    async (postId: string) => {
      setCaricamentoCommenti(true);
      setCommenti(null);
      setErrore(null);

      try {
        const risposta = await fetch(
          `/api/social/comments?piattaforma=${piattaforma}&postId=${encodeURIComponent(postId)}`
        );
        if (await intercettaPaywall(risposta, false)) return;

        const corpo = await risposta.json().catch(() => null);
        if (!risposta.ok) {
          setErrore(corpo?.message ?? "Non riesco a leggere i commenti di questo post.");
          return;
        }

        setCommenti(corpo.comments ?? []);
      } catch {
        setErrore("Non riesco a contattare il server. Controlla la connessione.");
      } finally {
        setCaricamentoCommenti(false);
      }
    },
    [intercettaPaywall, piattaforma]
  );

  useEffect(() => {
    void caricaPost();
  }, [caricaPost]);

  useEffect(() => {
    if (selezionato) void caricaCommenti(selezionato.id);
  }, [selezionato, caricaCommenti]);

  function apriRisposta(commento: CommentoSocial) {
    setInRisposta(commento.id);
    setBozza("");
    setBozzaDaAi(false);
    setConferma(null);
  }

  async function scriviConAi(commento: CommentoSocial) {
    setGenerazione(true);
    setErrore(null);

    try {
      const risposta = await fetch("/api/social/comments/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          piattaforma,
          commento: commento.testo,
          autore: commento.autore,
          didascalia: selezionato?.didascalia ?? undefined,
        }),
      });

      if (await intercettaPaywall(risposta, true)) return;

      const corpo = await risposta.json().catch(() => null);
      if (!risposta.ok) {
        setErrore(corpo?.message ?? "Non sono riuscito a scrivere la bozza.");
        return;
      }

      setBozza(corpo.draft);
      setBozzaDaAi(true);
    } catch {
      setErrore("Non riesco a contattare il server. Controlla la connessione.");
    } finally {
      setGenerazione(false);
    }
  }

  async function pubblica(commento: CommentoSocial) {
    const testo = bozza.trim();
    if (!testo) return;

    setInvio(true);
    setErrore(null);

    try {
      const risposta = await fetch("/api/social/comments/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          piattaforma,
          commentId: commento.id,
          azione: "rispondi",
          message: testo,
        }),
      });

      if (await intercettaPaywall(risposta, true)) return;

      const corpo = await risposta.json().catch(() => null);
      if (!risposta.ok) {
        setErrore(corpo?.message ?? "La risposta non è stata pubblicata.");
        return;
      }

      setInRisposta(null);
      setBozza("");
      setConferma(commento.id);
      if (selezionato) void caricaCommenti(selezionato.id);
    } catch {
      setErrore("Non riesco a contattare il server. Controlla la connessione.");
    } finally {
      setInvio(false);
    }
  }

  async function cambiaVisibilita(commento: CommentoSocial) {
    setAzioneSuCommento(commento.id);
    setErrore(null);

    try {
      const risposta = await fetch("/api/social/comments/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          piattaforma,
          commentId: commento.id,
          azione: commento.nascosto ? "mostra" : "nascondi",
        }),
      });

      if (await intercettaPaywall(risposta, true)) return;

      const corpo = await risposta.json().catch(() => null);
      if (!risposta.ok) {
        setErrore(corpo?.message ?? "Non sono riuscito a cambiare la visibilità del commento.");
        return;
      }

      if (selezionato) void caricaCommenti(selezionato.id);
    } catch {
      setErrore("Non riesco a contattare il server. Controlla la connessione.");
    } finally {
      setAzioneSuCommento(null);
    }
  }

  /*
   * Il selettore compare in tutti gli stati, anche in errore.
   *
   * Un'agenzia senza account Instagram collegato vede l'errore di Instagram:
   * se il selettore vivesse solo nella schermata riuscita, resterebbe chiusa
   * fuori da Facebook, che invece funziona. L'uscita da un errore non deve
   * essere ricaricare la pagina.
   */
  const selettore = (
    <div
      role="tablist"
      aria-label="Piattaforma dei commenti"
      className="inline-flex rounded-xl border border-border bg-card p-1"
    >
      {PIATTAFORME.map(({ id, label, icona: Icona }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={piattaforma === id}
          onClick={() => {
            if (id === piattaforma) return;
            setPiattaforma(id);
            // L'elenco mostrato appartiene all'altra piattaforma: tenerlo
            // visibile mentre si carica il nuovo farebbe cliccare su post
            // che stanno per sparire.
            setPost(null);
            setCommenti(null);
            setErrore(null);
            setInRisposta(null);
            setCaricamento(true);
          }}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors md:mouse:min-h-0",
            piattaforma === id
              ? "bg-brand-gradient text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icona className="h-4 w-4" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );

  const nomePiattaforma = piattaforma === "facebook" ? "Facebook" : "Instagram";
  const IconaPiattaforma = piattaforma === "facebook" ? Facebook : Instagram;

  if (paywall) {
    return <UpgradeLimitModal feature="social" reason={paywall.reason} requiredPlan={paywall.requiredPlan} />;
  }

  // Upsell in linea: chi apre la scheda senza avere la funzione legge cosa
  // otterrebbe e resta libero di chiudere e andare altrove.
  if (paywallInline) {
    return (
      <div className="card-surface space-y-4 p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-foreground">
            I commenti Instagram sono nel piano{" "}
            {paywallInline.requiredPlan ?? "Enterprise"}
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
            Leggi i commenti ricevuti sui tuoi post, rispondi con una bozza scritta dall&apos;AI e
            nascondi lo spam, senza uscire da PropertyTech.
          </p>
        </div>
        <Link href="/settings?tab=billing" className="btn-brand mx-auto w-full sm:w-auto">
          Vedi i piani
        </Link>
      </div>
    );
  }

  if (caricamento) {
    return (
      <div className="space-y-4" aria-busy="true">
        {selettore}
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  // Senza collegamento (o senza permesso) non c'è niente da mostrare: la
  // strada è una sola, e conviene che sia un pulsante invece di una frase.
  if (errore && !post) {
    return (
      <div className="space-y-4">
        {selettore}
        <div className="card-surface space-y-4 p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <IconaPiattaforma className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Commenti {nomePiattaforma} non disponibili
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">{errore}</p>
        </div>
        <Link href="/settings?tab=integrations" className="btn-brand mx-auto w-full sm:w-auto">
          Vai alle Integrazioni
        </Link>
        </div>
      </div>
    );
  }

  if (post && post.length === 0) {
    return (
      <div className="space-y-4">
        {selettore}
        <div className="card-surface space-y-2 p-6 text-center">
          <h2 className="text-base font-semibold text-foreground">
            Nessun post su {nomePiattaforma}
          </h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            I commenti vivono sotto i post. Pubblica il primo contenuto da qui o da
            {" "}
            {nomePiattaforma}, poi torna in questa scheda.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {selettore}

      {/* Striscia dei post: scorrevole sul telefono, dove non ci stanno in
          riga, e a capo sullo schermo grande. */}
      <section aria-label={`Post recenti su ${nomePiattaforma}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            Post recenti su {nomePiattaforma}
          </h2>
          <button
            type="button"
            onClick={() => void caricaPost()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground md:mouse:min-h-0"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Aggiorna
          </button>
        </div>

        <ul className="mt-3 flex gap-3 overflow-x-auto pb-2 sm:flex-wrap sm:overflow-visible">
          {post?.map((elemento) => {
            const attivo = selezionato?.id === elemento.id;
            return (
              <li key={elemento.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSelezionato(elemento)}
                  aria-pressed={attivo}
                  aria-label={`Post ${nomePiattaforma} del ${elemento.pubblicatoIl?.slice(0, 10) ?? "—"}, ${elemento.commenti} commenti`}
                  className={cn(
                    "relative block h-20 w-20 overflow-hidden rounded-xl border-2 transition-all",
                    attivo
                      ? "border-primary shadow-sm ring-2 ring-primary/20"
                      : "border-border opacity-80 hover:opacity-100"
                  )}
                >
                  {elemento.anteprima ? (
                    <img
                      src={elemento.anteprima}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    // Un post Facebook di solo testo non ha immagine: al suo
                    // posto l'icona della piattaforma, non un riquadro vuoto
                    // che sembra un caricamento mai finito.
                    <span className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
                      <IconaPiattaforma className="h-5 w-5" aria-hidden="true" />
                    </span>
                  )}

                  {/* Badge della piattaforma: resta anche quando le due viste
                      si somigliano, così un dubbio su "dove sto rispondendo"
                      non richiede di guardare il selettore. */}
                  <span className="absolute left-1 top-1 rounded-full bg-background/90 p-1 text-foreground">
                    <IconaPiattaforma className="h-3 w-3" aria-hidden="true" />
                  </span>

                  {elemento.commenti > 0 && (
                    <span className="absolute bottom-1 right-1 inline-flex items-center gap-0.5 rounded-full bg-background/90 px-1.5 py-0.5 text-[11px] font-semibold text-foreground">
                      <MessageCircle className="h-3 w-3" aria-hidden="true" />
                      {elemento.commenti}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {selezionato && (
        <section aria-label="Commenti del post" className="card-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Post del {quandoScritto(selezionato.pubblicatoIl) || "—"}
              </p>
              {selezionato.didascalia && (
                <p className="mt-1 line-clamp-2 max-w-xl text-sm text-foreground">
                  {selezionato.didascalia}
                </p>
              )}
            </div>
            {selezionato.permalink && (
              <a
                href={selezionato.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-primary hover:underline md:mouse:min-h-0"
              >
                Apri su {nomePiattaforma}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </div>

          {errore && (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-status-blocked/35 bg-status-blocked/10 p-3 text-sm text-foreground">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-status-blocked"
                aria-hidden="true"
              />
              {errore}
            </p>
          )}

          {caricamentoCommenti ? (
            <div className="mt-4 space-y-3" aria-busy="true">
              <div className="h-16 animate-pulse rounded-lg bg-muted" />
              <div className="h-16 animate-pulse rounded-lg bg-muted" />
            </div>
          ) : commenti && commenti.length === 0 ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Ancora nessun commento su questo post.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {commenti?.map((commento) => (
                <li
                  key={commento.id}
                  className={cn(
                    "rounded-xl border p-3.5 transition-colors sm:p-4",
                    commento.nascosto ? "border-dashed border-border bg-muted/40" : "border-border bg-card"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-foreground">
                      {piattaforma === "facebook" ? commento.autore : `@${commento.autore}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {quandoScritto(commento.scrittoIl)}
                    </span>
                    {commento.nascosto && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Nascosto
                      </span>
                    )}
                  </div>

                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {commento.testo}
                  </p>

                  {commento.risposte.length > 0 && (
                    <ul className="mt-3 space-y-2 border-l-2 border-primary/25 pl-3">
                      {commento.risposte.map((risposta) => (
                        <li key={risposta.id}>
                          <p className="text-xs">
                            <span className="font-semibold text-foreground">
                              {piattaforma === "facebook" ? risposta.autore : `@${risposta.autore}`}
                            </span>{" "}
                            <span className="text-muted-foreground">
                              {quandoScritto(risposta.scrittoIl)}
                            </span>
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">
                            {risposta.testo}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}

                  {conferma === commento.id && (
                    <p className="mt-3 text-xs font-medium text-status-qualified">
                      Risposta pubblicata su {nomePiattaforma}.
                    </p>
                  )}

                  {inRisposta === commento.id ? (
                    <div className="mt-3 space-y-2">
                      <label htmlFor={`risposta-${commento.id}`} className="sr-only">
                        Risposta a {commento.autore}
                      </label>
                      <textarea
                        id={`risposta-${commento.id}`}
                        value={bozza}
                        onChange={(evento) => setBozza(evento.target.value)}
                        rows={3}
                        placeholder="Scrivi la risposta, oppure falla scrivere all'AI e correggila."
                        className="w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
                      />

                      {bozzaDaAi && (
                        <p className="text-xs text-muted-foreground">{AI_DISCLAIMER}</p>
                      )}

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => void scriviConAi(commento)}
                          disabled={generazione || invio}
                          className="btn-outline w-full text-xs disabled:opacity-50 sm:w-auto"
                        >
                          {generazione ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          Scrivi con l&apos;AI
                        </button>

                        <button
                          type="button"
                          onClick={() => void pubblica(commento)}
                          disabled={!bozza.trim() || invio || generazione}
                          className="btn-brand w-full text-xs disabled:opacity-50 sm:w-auto"
                        >
                          {invio ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <Send className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          Pubblica risposta
                        </button>

                        <button
                          type="button"
                          onClick={() => setInRisposta(null)}
                          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground md:mouse:min-h-0"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                          Annulla
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => apriRisposta(commento)}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted md:mouse:min-h-0"
                      >
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        Rispondi
                      </button>

                      <button
                        type="button"
                        onClick={() => void cambiaVisibilita(commento)}
                        disabled={azioneSuCommento === commento.id}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 md:mouse:min-h-0"
                      >
                        {azioneSuCommento === commento.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : commento.nascosto ? (
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {commento.nascosto ? "Mostra di nuovo" : "Nascondi"}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
