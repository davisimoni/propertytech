"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Clipboard,
  FileText,
  Loader2,
  Trash2,
  History as HistoryIcon,
} from "lucide-react";
import {
  HISTORY_KIND_LABELS,
  type HistoryEntry,
  type HistoryKind,
} from "@/lib/history/entries";

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
      const text =
        typeof detail.output === "string"
          ? detail.output
          : flattenOutput(detail.output);

      await navigator.clipboard.writeText(text);
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

            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{entry.preview}</p>

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
  const text = typeof detail.output === "string" ? detail.output : flattenOutput(detail.output);

  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  // Nome file ricavato dal titolo: ritrovare "visura-via-roma.txt" fra i
  // download è tutt'altra cosa rispetto a "download(3).txt".
  link.download = `${entry.title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase().slice(0, 60)}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Appiattisce un risultato strutturato in testo leggibile.
 *
 * Incollare il JSON grezzo in un portale immobiliare non serve a nessuno: qui
 * si produce quello che l'agente vuole davvero incollare.
 */
function flattenOutput(output: unknown, depth = 0): string {
  if (output === null || output === undefined) return "";
  if (typeof output === "string") return output;
  if (typeof output === "number" || typeof output === "boolean") return String(output);

  if (Array.isArray(output)) {
    return output.map((item) => flattenOutput(item, depth)).filter(Boolean).join("\n");
  }

  if (typeof output === "object") {
    return Object.entries(output as Record<string, unknown>)
      .map(([key, value]) => {
        const rendered = flattenOutput(value, depth + 1);
        if (!rendered) return "";
        const label = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
        return rendered.includes("\n") ? `${label}:\n${rendered}` : `${label}: ${rendered}`;
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}
