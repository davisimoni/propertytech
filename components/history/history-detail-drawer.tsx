"use client";

import { useEffect, useState } from "react";
import { Check, Clipboard, FileText, Loader2, Trash2, X } from "lucide-react";
import { HISTORY_KIND_LABELS, type HistoryEntry } from "@/lib/history/entries";
import { downloadText, fileNameFromTitle, outputToText } from "@/lib/history/output-text";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/shared/toast-provider";
import { FormattedOutput } from "./formatted-output";

const DATE_FORMAT = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Dettaglio a schermo di un'elaborazione passata.
 *
 * Prima l'unico modo di rileggere un'estrazione era copiarla negli appunti e
 * incollarla altrove, oppure scaricarla: due gesti per una cosa che si voleva
 * solo guardare. L'elenco mostra 240 caratteri di anteprima, e su una visura
 * quei 240 caratteri finiscono prima dei dati catastali.
 *
 * # Struttura
 *
 * Intestazione e barra delle azioni restano fisse; scorre **solo** il
 * contenuto (`flex-1 overflow-y-auto`). È quello che serve su un'estrazione
 * lunga: i pulsanti non scappano in fondo alla pagina e il layout sotto non si
 * muove, perché il cassetto è in overlay e non occupa spazio nel flusso.
 */
export function HistoryDetailDrawer({
  entry,
  onClose,
  onDeleted,
}: {
  entry: HistoryEntry;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [output, setOutput] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    let annullato = false;
    setIsLoading(true);
    setLoadError(false);

    fetch(`/api/history/${entry.id}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((detail: { output: unknown }) => {
        if (!annullato) setOutput(detail.output);
      })
      .catch(() => {
        // Errore dichiarato e non contenuto vuoto: davanti a "nessun testo"
        // l'agente crede che l'elaborazione sia andata male, e rilancia
        // un'analisi che gli costa un altro credito.
        if (!annullato) setLoadError(true);
      })
      .finally(() => {
        if (!annullato) setIsLoading(false);
      });

    return () => {
      annullato = true;
    };
  }, [entry.id]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !isDeleting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, isDeleting]);

  const testo = output === null ? "" : outputToText(output);

  async function copy() {
    try {
      await navigator.clipboard.writeText(testo);
      setCopied(true);
      showToast("Testo copiato negli appunti.", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError("Copia non riuscita.");
    }
  }

  async function remove() {
    setIsDeleting(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/history/${entry.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      showToast("Elaborazione eliminata.", "success");
      onDeleted();
    } catch {
      setActionError("Eliminazione non riuscita.");
      showToast("Eliminazione non riuscita.", "error");
      setIsDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Dettaglio: ${entry.title}`}
        className="relative flex w-full max-w-2xl flex-col bg-card shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{entry.title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {HISTORY_KIND_LABELS[entry.kind]} · {DATE_FORMAT.format(new Date(entry.createdAt))}
              {entry.authorName && ` · ${entry.authorName}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi il dettaglio"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-all duration-200 hover:bg-muted sm:h-8 sm:w-8"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Azioni fisse: su un'estrazione lunga, in fondo al contenuto sarebbero
            raggiungibili solo dopo aver scorso tutto. */}
        <div className="flex flex-wrap gap-2 border-b border-border p-4">
          <button
            type="button"
            onClick={copy}
            disabled={isLoading || loadError}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-all duration-200 hover:bg-muted disabled:opacity-50 sm:h-9"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-status-qualified" aria-hidden="true" />
            ) : (
              <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied ? "Copiato" : "Copia testo"}
          </button>

          <button
            type="button"
            onClick={() => downloadText(testo, fileNameFromTitle(entry.title))}
            disabled={isLoading || loadError}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-all duration-200 hover:bg-muted disabled:opacity-50 sm:h-9"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Scarica testo
          </button>

          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={isDeleting}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-status-blocked transition-all duration-200 hover:bg-status-blocked/10 disabled:opacity-50 sm:h-9"
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Elimina
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carico il contenuto…
            </p>
          ) : loadError ? (
            <p className="text-sm text-status-blocked">
              Non è stato possibile caricare questa elaborazione. Chiudi e riapri il dettaglio.
            </p>
          ) : (
            <FormattedOutput output={output} />
          )}

          {actionError ? (
            <p className="mt-3 text-xs text-status-blocked">{actionError}</p>
          ) : null}
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title={`Eliminare "${entry.title}"?`}
          description="La cronologia e' la sola copia di questa elaborazione, gia' pagata a credito. Rigenerarla ne consumera' un altro."
          confirmLabel="Elimina"
          cancelLabel="Torna indietro"
          isWorking={isDeleting}
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
