"use client";

import type { UserRole } from "@prisma/client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clipboard, HelpCircle, Loader2, RefreshCw, Rss, TriangleAlert } from "lucide-react";
import { FeedSetupDialog } from "@/components/properties/feed-setup-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/shared/toast-provider";

/**
 * Riquadro di configurazione del feed XML verso i portali.
 *
 * L'URL si compone nel browser da `window.location.origin`: è sempre l'origine
 * da cui l'agente sta effettivamente guardando la pagina, quindi resta corretto
 * in locale, in anteprima e in produzione senza dipendere da una variabile
 * d'ambiente che qualcuno dovrà ricordarsi di aggiornare.
 */
export function PortalFeedPanel({
  /**
   * Quanti immobili il feed pubblica senza fotografie. Calcolato dal
   * portafoglio: e' l'unico modo perche' l'avviso sparisca da solo quando
   * l'agenzia ha finito di caricarle.
   */
  missingPhotos,
  /**
   * Quanti immobili nel feed non hanno il CAP. Stesso criterio delle foto:
   * contati sui soli pubblicati, cosi' l'avviso sparisce da solo quando
   * l'agenzia ha finito di compilarli.
   */
  missingCap = 0,
  publishedCount,
  draftCount,
  currentRole,
}: {
  missingPhotos: number;
  missingCap?: number;
  /** Immobili che il feed esporta davvero. */
  publishedCount?: number;
  /** Immobili in bozza: fuori dal feed finche' l'agente non li pubblica. */
  draftCount?: number;
  currentRole: UserRole;
}) {
  // Attivare e revocare il feed vale per TUTTA l'agenzia: la revoca ritira gli
  // annunci dai portali alla rilettura successiva. Il comando compare solo a
  // chi puo' eseguirlo, invece di mostrare un pulsante che riceve un 403.
  const isOwner = currentRole === "OWNER";
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  /** Revoca in attesa di conferma: spegne il feed su tutti i portali. */
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  /** Rigenerazione in attesa di conferma: il vecchio indirizzo smette di valere. */
  const [confirmingRotate, setConfirmingRotate] = useState(false);
  /** Istruzioni per i portali, aperte su richiesta. */
  const [showSetup, setShowSetup] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/properties/feed-token");
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { token: string | null };
      setToken(data.token);
    } catch {
      setError("Non è stato possibile leggere lo stato del feed.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ESITI = {
    POST: { ok: "Feed attivato.", ko: "Attivazione non riuscita. Riprova." },
    PUT: {
      ok: "Indirizzo rigenerato: aggiornalo sui portali.",
      ko: "Rigenerazione non riuscita. Riprova.",
    },
    DELETE: {
      ok: "Feed revocato: l'indirizzo non risponde più.",
      ko: "Revoca non riuscita. Riprova.",
    },
  } as const;

  async function mutate(method: "POST" | "PUT" | "DELETE") {
    setIsWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/properties/feed-token", { method });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { token: string | null };
      setToken(data.token);
      showToast(ESITI[method].ok, "success");
    } catch {
      setError(ESITI[method].ko);
      showToast("Operazione non riuscita. Riprova.", "error");
    } finally {
      setIsWorking(false);
      setConfirmingRevoke(false);
      setConfirmingRotate(false);
    }
  }

  const feedUrl = token && origin ? `${origin}/api/feed/xml?token=${token}` : "";

  async function copy() {
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    showToast("Indirizzo del feed copiato.", "success");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Rss className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Sincronizzazione Automatica Portali (XML)
          </h2>
          {/* Non piu' "incolla nelle impostazioni del tuo portale".

              Quel pannello non esiste: su Immobiliare.it, Idealista e Casa.it
              l'URL del feed lo registra il portale nei propri sistemi, su
              richiesta. L'agente che andava a cercare la voce non la trovava e
              concludeva che il feed fosse rotto. */}
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            I portali immobiliari importano i dati registrando l&apos;URL del feed nei loro
            sistemi centrali. Copia questo link e invialo all&apos;assistenza del portale o al tuo
            referente commerciale.
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Caricamento…
        </p>
      ) : token ? (
        <div className="mt-4 space-y-3">
          {/* L'indirizzo resta visibile ma smette di essere il protagonista.

              Prima era un link nudo con un'iconcina accanto: chi non sapeva
              gia' cosa farne leggeva una stringa lunga e non capiva se andasse
              cliccata, aperta o copiata. Ora l'azione ha un nome — "Copia
              Indirizzo Feed XML" — e la stringa serve solo a verificare che sia
              quella giusta. */}
          <code className="block truncate rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {feedUrl}
          </code>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={copy} className="btn-brand text-xs">
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Clipboard className="h-4 w-4" />
              )}
              {copied ? "Copiato!" : "Copia Indirizzo Feed XML"}
            </button>

            <button
              type="button"
              onClick={() => setShowSetup(true)}
              className="btn-outline text-xs"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Come configurarlo
            </button>
          </div>

          {/* Quanti immobili il feed porta davvero.

              Serve da quando i nuovi immobili nascono in bozza: senza questa
              riga, un'agenzia che ne salva cinque e incolla il link vedrebbe
              il portale restare vuoto senza capire perche', e concluderebbe
              che il feed non funziona. */}
          {typeof publishedCount === "number" && (
            <p className="text-xs text-muted-foreground">
              Nel feed adesso:{" "}
              <span className="font-medium text-foreground">
                {publishedCount} {publishedCount === 1 ? "immobile" : "immobili"}
              </span>
              {draftCount ? (
                <>
                  {" "}
                  &middot; {draftCount} in bozza, {draftCount === 1 ? "escluso" : "esclusi"}{" "}
                  finche&apos; non {draftCount === 1 ? "lo marchi" : "li marchi"} &laquo;In
                  vendita&raquo; dalla scheda.
                </>
              ) : null}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            L&apos;indirizzo contiene una chiave riservata: chi lo possiede legge il tuo
            portafoglio. Condividilo solo con i portali.
          </p>

          {isOwner ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* Rigenera prima di Revoca: e' l'azione che si cerca dopo una
                  fuga di notizie, e l'altra spegne la sincronizzazione. */}
              <button
                type="button"
                onClick={() => setConfirmingRotate(true)}
                disabled={isWorking}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Rigenera Token / URL
              </button>

              <button
                type="button"
                onClick={() => setConfirmingRevoke(true)}
                disabled={isWorking}
                className="text-xs font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-status-blocked disabled:opacity-50"
              >
                {isWorking ? "Operazione in corso…" : "Revoca l'indirizzo"}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4">
          {isOwner ? (
            <button
              type="button"
              onClick={() => mutate("POST")}
              disabled={isWorking}
              className="btn-brand text-xs disabled:opacity-50"
            >
              {isWorking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Rss className="h-3.5 w-3.5" />
              )}
              Attiva il feed
            </button>
          ) : (
            // Detto e non nascosto: un collaboratore che non trova il feed
            // penserebbe che la funzione non esista, e lo chiederebbe a noi
            // invece che al proprio titolare.
            <p className="text-xs text-muted-foreground">
              Il feed verso i portali lo attiva il titolare dell&apos;agenzia.
            </p>
          )}
        </div>
      )}

      {error ? <p className="mt-3 text-xs text-status-blocked">{error}</p> : null}

      {/*
        Avviso legato ai dati, non fisso.
        Prima compariva sempre, anche quando ogni annuncio aveva le sue foto:
        un avviso che resta acceso a problema risolto insegna a ignorarlo, e la
        volta che conta davvero nessuno lo legge. Ora conta gli immobili che il
        feed pubblica SENZA immagini — gli unici per cui il problema esiste.
      */}
      {confirmingRevoke && (
        <ConfirmDialog
          title="Revocare l'indirizzo del feed?"
          description="I portali che lo interrogano smettono di ricevere il portafoglio e ritirano gli annunci pubblicati. Potrai generarne uno nuovo, ma dovrai riconfigurarlo su ogni pannello."
          confirmLabel="Revoca l'indirizzo"
          cancelLabel="Torna indietro"
          isWorking={isWorking}
          onConfirm={() => mutate("DELETE")}
          onCancel={() => setConfirmingRevoke(false)}
        />
      )}

      {confirmingRotate && (
        <ConfirmDialog
          title="Rigenerare l'indirizzo del feed?"
          description="Il nuovo indirizzo funziona subito, ma il vecchio smette di valere nello stesso istante: i portali che hanno ancora quello ricevono un errore e alla rilettura successiva ritirano gli annunci. Rigeneralo solo se il link è stato divulgato, e appena fatto consegna il nuovo a ogni portale che lo usa."
          confirmLabel="Rigenera l'indirizzo"
          cancelLabel="Torna indietro"
          isWorking={isWorking}
          onConfirm={() => mutate("PUT")}
          onCancel={() => setConfirmingRotate(false)}
        />
      )}

      {showSetup && (
        <FeedSetupDialog feedUrl={feedUrl} onClose={() => setShowSetup(false)} />
      )}

      {/* Un riquadro solo per tutto cio' che indebolisce gli annunci nel feed,
          una riga per problema. Due riquadri ambra impilati si leggono come
          rumore, e il secondo non viene letto affatto. */}
      {missingPhotos > 0 || missingCap > 0 ? (
        <div className="mt-4 space-y-2 rounded-lg border border-status-pending/40 bg-status-pending/10 px-3 py-2">
          {missingCap > 0 ? (
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-pending" />
              <span>
                {missingCap === 1
                  ? "Un immobile pubblicato non ha il CAP"
                  : `${missingCap} immobili pubblicati non hanno il CAP`}
                : i portali lo richiedono di norma e senza di esso possono scartare
                l&apos;annuncio. Il resto del feed resta valido. Lo compili dalla scheda, qui
                sotto.
              </span>
            </p>
          ) : null}

          {missingPhotos > 0 ? (
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-pending" />
              <span>
                {missingPhotos === 1
                  ? "Un immobile pubblicato non ha fotografie"
                  : `${missingPhotos} immobili pubblicati non hanno fotografie`}
                : sui portali l&apos;annuncio compare in ricerca senza immagine e viene aperto
                molto meno. Puoi aggiungerle dalla scheda, qui sotto.
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
