"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Clipboard,
  FileDown,
  FileText,
  Loader2,
  Search,
  Send,
  Trash2,
  Eye,
  X,
  History as HistoryIcon,
} from "lucide-react";
import { downloadPdf, fetchPdfBranding } from "@/lib/pdf/client";
import { sellerReportFileName } from "@/lib/pdf/file-name";
import type { VoiceReportContent } from "@/lib/ai/report-schema";
import {
  HISTORY_KIND_LABELS,
  type HistoryEntry,
  type HistoryKind,
} from "@/lib/history/entries";
import type { LucideIcon } from "lucide-react";
import { downloadText, fileNameFromTitle, outputToText } from "@/lib/history/output-text";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/shared/toast-provider";
import { EmptyStateCard } from "@/components/shared/empty-state-card";
import { SkeletonList } from "@/components/shared/skeleton";
import { HistoryDetailDrawer } from "./history-detail-drawer";

/** Configurazione dell'empty state ricco, per i quattro moduli principali. */
export interface HistoryEmptyStateConfig {
  icon: LucideIcon;
  title: string;
  description: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/**
 * Cronologia delle elaborazioni, condivisa dai tre moduli.
 *
 * Un componente solo con un filtro per tipo, anziché tre elenchi simili: le
 * differenze fra un'estrazione da visura e un annuncio social stanno nel
 * contenuto, non nel modo di sfogliarlo.
 */

interface GenerationHistoryProps {
  kind: HistoryKind;
  /** Ricarica quando il modulo produce una nuova elaborazione. */
  reloadKey?: number;
  /** Limita lo storico a un immobile: usato nella scheda dell'immobile. */
  propertyId?: string;
  emptyHint?: string;
  emptyState?: HistoryEmptyStateConfig;
}

const DATE_FORMAT = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function GenerationHistory({
  kind,
  reloadKey = 0,
  propertyId,
  emptyHint,
  emptyState,
}: GenerationHistoryProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [opened, setOpened] = useState<HistoryEntry | null>(null);
  const [confirming, setConfirming] = useState<HistoryEntry | null>(null);
  const { showToast } = useToast();
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /**
   * Due stati per una sola ricerca: quello che si sta digitando e quello
   * effettivamente cercato.
   *
   * Senza la pausa, ogni tasto premuto sarebbe una chiamata al server, e le
   * risposte tornerebbero in ordine sparso: scrivendo "via roma" si vedrebbe
   * lampeggiare il risultato di "via rom" sopra quello di "via roma".
   */
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  /** Report per cui si sta chiedendo il numero del proprietario, e il numero digitato. */
  const [chiedeNumero, setChiedeNumero] = useState<HistoryEntry | null>(null);
  const [numero, setNumero] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setAppliedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    async (nextCursor: string | null) => {
      const params = new URLSearchParams({ kind });
      if (propertyId) params.set("propertyId", propertyId);
      if (appliedQuery) params.set("q", appliedQuery);
      if (nextCursor) params.set("cursor", nextCursor);

      const response = await fetch(`/api/history?${params}`);
      if (!response.ok) throw new Error("load_failed");
      return (await response.json()) as { entries: HistoryEntry[]; nextCursor: string | null };
    },
    [kind, propertyId, appliedQuery]
  );

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    load(null)
      .then((data) => {
        // `active`: se il tipo cambia mentre la richiesta è in volo, la
        // risposta vecchia non deve sovrascrivere quella nuova.
        if (!active) return;
        setEntries(data.entries);
        setCursor(data.nextCursor);
      })
      .catch(() => active && setError("Non siamo riusciti a caricare la cronologia."))
      .finally(() => active && setIsLoading(false));

    return () => {
      active = false;
    };
  }, [load, reloadKey]);

  async function loadMore() {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);

    try {
      const data = await load(cursor);
      setEntries((current) => [...current, ...data.entries]);
      setCursor(data.nextCursor);
    } catch {
      setError("Non siamo riusciti a caricare altre voci.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  /** Copia il risultato completo, non l'anteprima troncata. */
  async function copy(entry: HistoryEntry) {
    setBusyId(entry.id);

    try {
      const response = await fetch(`/api/history/${entry.id}`);
      if (!response.ok) throw new Error();

      const detail = (await response.json()) as { output: unknown };
      await navigator.clipboard.writeText(outputToText(detail.output));
      showToast("Testo copiato negli appunti.", "success");
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError("Copia non riuscita.");
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Invia al proprietario un report già generato, senza riaprire il modulo.
   *
   * Il numero non si chiede qui: la rotta usa quello salvato sul report. Se
   * manca, lo dice e si va a completarlo dove quel dato si inserisce — un
   * campo telefono improvvisato in un elenco manderebbe un documento a un
   * numero digitato di fretta, e l'invio non si annulla.
   */
  async function sendToSeller(entry: HistoryEntry, phone?: string) {
    setBusyId(entry.id);

    try {
      const response = await fetch(`/api/reports/${entry.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(phone ? { sellerPhone: phone } : {}),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;

      if (response.ok) {
        showToast("Report inviato al proprietario.", "success");
        setEntries((current) =>
          current.map((item) => (item.id === entry.id ? { ...item, sent: true } : item))
        );
        setChiedeNumero(null);
        return;
      }

      /*
       * Numero mancante: si chiede, non si rimanda altrove.
       *
       * Sui report in archivio è il caso normale, non l'eccezione — la nota
       * post-visita si registra in macchina, il recapito del proprietario si
       * ha in rubrica. La rotta accetta il numero nel corpo e lo salva, così
       * la volta dopo non lo richiede.
       */
      if (body?.error === "missing_seller_phone" && !phone) {
        setChiedeNumero(entry);
        return;
      }

      const messaggi: Record<string, string> = {
        missing_seller_phone: "Numero non valido: controlla il prefisso e riprova.",
        whatsapp_not_connected: "WhatsApp non è collegato: configuralo in Qualifica Lead.",
        feature_not_in_plan: "I report post-visita non sono inclusi nel tuo piano.",
        invalid_report: "Questo report non è in un formato inviabile.",
      };

      showToast(
        messaggi[body?.error ?? ""] ?? body?.message ?? "Invio non riuscito.",
        "error"
      );
    } catch {
      showToast("Errore di rete. Il report non è stato inviato.", "error");
    } finally {
      setBusyId(null);
    }
  }

  /** Scarica il PDF del report, lo stesso documento che produce il modulo. */
  async function downloadReportPdf(entry: HistoryEntry) {
    setBusyId(entry.id);

    try {
      const [branding, detail] = await Promise.all([
        fetchPdfBranding(),
        fetch(`/api/history/${entry.id}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error()))),
      ]);

      // Caricato solo al clic: @react-pdf pesa, e la cronologia si apre anche
      // per copiare due righe.
      const { SellerReportDocument } = await import("@/lib/pdf/seller-report-document");

      const propertyRef = entry.propertyRef ?? entry.title;
      const sellerName = entry.sellerName ?? null;

      await downloadPdf(
        SellerReportDocument({
          branding,
          // La rotta di dettaglio non rivalida i report vecchi contro lo schema
          // di oggi (vedi la nota là): il documento li accetta come sono.
          report: (detail as { output: unknown }).output as VoiceReportContent,
          propertyRef,
          sellerName,
        }),
        sellerReportFileName({ propertyRef, sellerName })
      );
    } catch {
      showToast("Non è stato possibile generare il PDF.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(entry: HistoryEntry) {
    setBusyId(entry.id);

    try {
      const response = await fetch(`/api/history/${entry.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      setEntries((current) => current.filter((item) => item.id !== entry.id));
    } catch {
      setError("Eliminazione non riuscita.");
    } finally {
      setBusyId(null);
    }
  }

  // "Non hai ancora niente" e "la ricerca non ha trovato nulla" sono due cose
  // diverse: la seconda è una cronologia piena guardata attraverso un filtro,
  // e mostrarle l'invito a generare il primo contenuto sarebbe una bugia.
  if (!isLoading && entries.length === 0 && !appliedQuery) {
    // Con una configurazione ricca, la scheda condivisa: icona del modulo,
    // due righe di valore vero e un pulsante che riporta al lavoro. Senza
    // (uso scoperto sulla scheda di un immobile, non su uno dei quattro
    // moduli principali) resta il riquadro minimo che c'era già.
    if (emptyState) {
      return (
        <EmptyStateCard
          icon={emptyState.icon}
          title={emptyState.title}
          description={emptyState.description}
          primaryAction={{ label: emptyState.primaryLabel, onClick: emptyState.onPrimary }}
          secondaryAction={
            emptyState.secondaryLabel && emptyState.onSecondary
              ? { label: emptyState.secondaryLabel, onClick: emptyState.onSecondary }
              : undefined
          }
        />
      );
    }

    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <HistoryIcon className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="mt-2 text-sm font-medium text-foreground">Nessuna elaborazione ancora</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {emptyHint ?? `Le elaborazioni di tipo "${HISTORY_KIND_LABELS[kind]}" compariranno qui.`}
        </p>
      </div>
    );
  }

  /*
   * La barra compare solo quando c'è qualcosa da cercare, o quando una
   * ricerca è in corso: su una cronologia vuota sarebbe un campo che non può
   * dare risultati. Resta montata durante il caricamento, altrimenti sparirebbe
   * sotto le dita a metà digitazione portandosi via il fuoco.
   */
  const mostraRicerca = entries.length > 0 || appliedQuery !== "";

  return (
    <div>
      {mostraRicerca && (
        <div className="relative mb-3">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca per immobile, nome o testo…"
            aria-label="Cerca nella cronologia"
            className="input-field h-11 w-full pl-9 pr-9 text-base sm:h-10 sm:text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Azzera la ricerca"
              className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mb-3 text-sm text-status-blocked">
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="card-surface p-4 md:p-5">
          <SkeletonList rows={3} label="Caricamento della cronologia" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Search className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-foreground">
            Nessun risultato per &laquo;{appliedQuery}&raquo;
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            La ricerca guarda l&apos;immobile, il nome e il testo dell&apos;elaborazione.
          </p>
          <button type="button" onClick={() => setQuery("")} className="btn-outline mt-3 text-xs">
            Azzera la ricerca
          </button>
        </div>
      ) : (
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{entry.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {DATE_FORMAT.format(new Date(entry.createdAt))}
                  {entry.authorName && ` · ${entry.authorName}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                {/* Nascosto sul telefono: dentro "Analisi Documenti" ogni voce
                    è un'analisi documento, quindi il badge non aggiunge nulla
                    e in una colonna stretta fa impilare i badge, allungando la
                    card di una riga. Su schermo largo lo spazio c'è e resta. */}
                <span className="hidden rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-flex">
                  {HISTORY_KIND_LABELS[entry.kind]}
                </span>
                {/* Solo dove "inviare" vuol dire qualcosa: un'estrazione da
                    visura non ha un destinatario. `null` è assenza di
                    concetto, `false` è "generato e mai mandato". */}
                {entry.sent !== null && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      entry.sent
                        ? "bg-status-qualified/10 text-status-qualified"
                        : "bg-status-pending/10 text-status-pending"
                    }`}
                  >
                    {entry.sent ? "Inviato" : "Da inviare"}
                  </span>
                )}
              </div>
            </div>

            {/*
              L'anteprima apre il dettaglio. E' un <button> e non un <div> con
              onClick: si raggiunge da tastiera, lo annuncia lo screen reader e
              non serve reimplementare nulla. Non e' la card intera a essere
              cliccabile, perche' contiene gia' tre pulsanti e un click
              sbagliato su "Elimina" non si annulla.
            */}
            <button
              type="button"
              onClick={() => setOpened(entry)}
              className="mt-2 block w-full rounded-lg text-left transition-colors hover:bg-muted/60"
            >
              <span className="line-clamp-2 text-xs text-muted-foreground">{entry.preview}</span>
              <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                Apri e leggi tutto
              </span>
            </button>

            {/* Spaziatura più stretta sotto i 640 px: con quattro azioni, a
                360 px la riga andava a capo per una manciata di pixel. */}
            <div className="mt-3 flex flex-wrap gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => copy(entry)}
                disabled={busyId === entry.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs font-medium sm:px-2.5 text-foreground transition-all duration-200 hover:bg-muted disabled:opacity-50"
              >
                {copiedId === entry.id ? (
                  <Check className="h-3.5 w-3.5 text-status-qualified" aria-hidden="true" />
                ) : (
                  <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {/* Etichetta intera dove c'è spazio, corta sul telefono: con
                    quattro azioni a 390 px la riga andava a capo e la card
                    passava da 179 a 233 px di altezza. */}
                <span className="hidden sm:inline">
                  {copiedId === entry.id ? "Copiato" : "Copia testo"}
                </span>
                <span className="sm:hidden">{copiedId === entry.id ? "Fatto" : "Copia"}</span>
              </button>

              {/* Il PDF solo dove esiste davvero un documento impaginato — i
                  report post-visita. Per un'estrazione o un post social il
                  formato utile è il testo, che si incolla dove serve. */}
              {entry.hasPdf ? (
                <button
                  type="button"
                  onClick={() => downloadReportPdf(entry)}
                  disabled={busyId === entry.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs font-medium sm:px-2.5 text-foreground transition-all duration-200 hover:bg-muted disabled:opacity-50"
                >
                  <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Scarica PDF</span>
                  <span className="sm:hidden">PDF</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => download(entry)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs font-medium sm:px-2.5 text-foreground transition-all duration-200 hover:bg-muted"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Scarica testo</span>
                  <span className="sm:hidden">Testo</span>
                </button>
              )}

              {/* L'invio al proprietario, dove il destinatario esiste. Non
                  chiede conferma perché la rotta non spedisce a un numero
                  scritto qui: usa quello già salvato sul report. */}
              {entry.sent !== null && (
                <button
                  type="button"
                  onClick={() => sendToSeller(entry)}
                  disabled={busyId === entry.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs font-medium sm:px-2.5 text-foreground transition-all duration-200 hover:bg-muted disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">
                    {entry.sent ? "Invia di nuovo" : "Invia su WhatsApp"}
                  </span>
                  <span className="sm:hidden">{entry.sent ? "Rinvia" : "Invia"}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setConfirming(entry)}
                disabled={busyId === entry.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs font-medium sm:px-2.5 text-status-blocked transition-all duration-200 hover:bg-status-blocked/10 disabled:opacity-50"
              >
                {busyId === entry.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Elimina
              </button>
            </div>
          </li>
        ))}
      </ul>
      )}

      {confirming && (
        <ConfirmDialog
          title={`Eliminare "${confirming.title}"?`}
          description="La cronologia e' la sola copia di questa elaborazione, gia' pagata a credito. Rigenerarla ne consumera' un altro."
          confirmLabel="Elimina"
          cancelLabel="Torna indietro"
          isWorking={busyId === confirming.id}
          onConfirm={async () => {
            await remove(confirming);
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}

      {chiedeNumero && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Numero del proprietario"
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
        >
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setChiedeNumero(null)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-foreground">
              A che numero lo mandiamo?
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Su questo report non c&apos;è ancora il recapito del proprietario. Lo salviamo
              insieme al report, così la prossima volta non serve reinserirlo.
            </p>
            <input
              type="tel"
              value={numero}
              autoFocus
              onChange={(event) => setNumero(event.target.value)}
              placeholder="Es. +39 333 1234567"
              aria-label="Numero WhatsApp del proprietario"
              className="input-field mt-3 h-11 w-full text-base sm:text-sm"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setChiedeNumero(null)}
                className="btn-outline text-xs"
              >
                Annulla
              </button>
              <button
                type="button"
                // Il minimo della rotta è sei cifre: sotto è sicuramente un
                // errore di battitura, e un invio a un numero storto non si
                // annulla.
                disabled={numero.replace(/\D/g, "").length < 6 || busyId === chiedeNumero.id}
                onClick={() => {
                  const destinatario = chiedeNumero;
                  void sendToSeller(destinatario, numero.trim()).then(() => setNumero(""));
                }}
                className="btn-brand text-xs disabled:opacity-50"
              >
                {busyId === chiedeNumero.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Invia
              </button>
            </div>
          </div>
        </div>
      )}

      {opened && (
        <HistoryDetailDrawer
          entry={opened}
          onClose={() => setOpened(null)}
          onDeleted={() => {
            // La voce sparisce dall'elenco senza ricaricarlo: un refetch
            // rimanderebbe l'agente in cima a una lista che stava scorrendo.
            setEntries((current) => current.filter((item) => item.id !== opened.id));
            setOpened(null);
          }}
        />
      )}

      {cursor && (
        <button
          type="button"
          onClick={loadMore}
          disabled={isLoadingMore}
          className="btn-outline mt-3 w-full"
        >
          {isLoadingMore ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <HistoryIcon className="h-4 w-4" aria-hidden="true" />
          )}
          Carica altre elaborazioni
        </button>
      )}
    </div>
  );
}

/** Scarica il risultato come file di testo. */
async function download(entry: HistoryEntry) {
  const response = await fetch(`/api/history/${entry.id}`);
  if (!response.ok) return;

  const detail = (await response.json()) as { output: unknown };
  downloadText(outputToText(detail.output), fileNameFromTitle(entry.title));
}
