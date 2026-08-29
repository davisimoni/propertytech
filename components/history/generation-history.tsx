"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Clipboard,
  FileText,
  Loader2,
  Trash2,
  Eye,
  History as HistoryIcon,
} from "lucide-react";
import {
  HISTORY_KIND_LABELS,
  type HistoryEntry,
  type HistoryKind,
} from "@/lib/history/entries";
import { downloadText, fileNameFromTitle, outputToText } from "@/lib/history/output-text";
import { HistoryDetailDrawer } from "./history-detail-drawer";

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
}: GenerationHistoryProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [opened, setOpened] = useState<HistoryEntry | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (nextCursor: string | null) => {
      const params = new URLSearchParams({ kind });
      if (propertyId) params.set("propertyId", propertyId);
      if (nextCursor) params.set("cursor", nextCursor);

      const response = await fetch(`/api/history?${params}`);
      if (!response.ok) throw new Error("load_failed");
      return (await response.json()) as { entries: HistoryEntry[]; nextCursor: string | null };
    },
    [kind, propertyId]
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
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError("Copia non riuscita.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(entry: HistoryEntry) {
    // Conferma esplicita: la cronologia è la sola copia di un'elaborazione già
    // pagata a credito, e un tocco per sbaglio sul telefono la porterebbe via.
    if (!window.confirm(`Eliminare "${entry.title}" dalla cronologia?`)) return;

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (entries.length === 0) {
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

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-status-blocked">
          {error}
        </p>
      )}

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
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {HISTORY_KIND_LABELS[entry.kind]}
              </span>
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

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copy(entry)}
                disabled={busyId === entry.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:bg-muted disabled:opacity-50"
              >
                {copiedId === entry.id ? (
                  <Check className="h-3.5 w-3.5 text-status-qualified" aria-hidden="true" />
                ) : (
                  <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {copiedId === entry.id ? "Copiato" : "Copia testo"}
              </button>

              {/* Testo e non PDF: il PDF si genera nel browser a partire dal
                  documento che l'agente ha davanti, non da una voce di elenco. */}
              <button
                type="button"
                onClick={() => download(entry)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:bg-muted"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                Scarica testo
              </button>

              <button
                type="button"
                onClick={() => remove(entry)}
                disabled={busyId === entry.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-status-blocked transition-all duration-200 hover:bg-status-blocked/10 disabled:opacity-50"
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
