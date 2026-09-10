"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileDown, Loader2, Upload, X } from "lucide-react";
import { PROPERTY_CSV_COLUMNS, buildPropertyCsvTemplate } from "@/lib/listings/csv-import";

interface ImportResult {
  imported: number;
  errors: { line: number; reference: string; message: string }[];
  truncated: boolean;
}

/**
 * Import del portafoglio da CSV/Excel.
 *
 * Colonne fisse, non una mappatura da configurare: chi arriva con un
 * portafoglio già in Excel scarica il modello, incolla le righe che ha già e
 * ricarica. Le righe con un problema non bloccano le altre — l'elenco degli
 * errori dice riga e motivo, così si corregge solo quello che serve.
 */
export function PropertyImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function scaricaTemplate() {
    const csv = buildPropertyCsvTemplate();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "portafoglio-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function upload(file: File) {
    setIsUploading(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const response = await fetch("/api/properties/import", { method: "POST", body: form });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.message ?? `Caricamento non riuscito (errore ${response.status}).`);
        return;
      }

      setResult(data);
      if (data.imported > 0) onImported();
    } catch {
      setError("Errore di rete. Il file non è stato caricato.");
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Importa portafoglio da CSV"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Importa portafoglio da CSV</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-8 sm:w-8"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          Scarica il modello, incollaci le righe che hai già in Excel e ricaricalo: gli immobili si
          aggiungono al portafoglio con lo stesso riferimento con cui li ricarichi la prossima volta,
          così una correzione aggiorna invece di duplicare.
        </p>

        <button type="button" onClick={scaricaTemplate} className="btn-outline mt-3 text-xs">
          <FileDown className="h-3.5 w-3.5" />
          Scarica il modello CSV
        </button>

        <details className="mt-3 rounded-lg border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">Colonne attese</summary>
          <ul className="mt-2 space-y-1">
            {PROPERTY_CSV_COLUMNS.map((c) => (
              <li key={c.key}>
                <span className="font-medium text-foreground">{c.label}</span>
                {c.required ? " (obbligatoria)" : " (facoltativa)"}
              </li>
            ))}
          </ul>
        </details>

        <label
          className={`mt-4 flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-brand-gradient px-3 text-xs font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 ${
            isUploading ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {isUploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {isUploading ? "Caricamento…" : "Carica il file compilato"}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={isUploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>

        {error && (
          <p role="alert" className="mt-3 text-xs text-status-blocked">
            {error}
          </p>
        )}

        {result && (
          <div className="mt-4 space-y-2">
            {result.imported > 0 && (
              <p className="flex items-center gap-1.5 text-sm text-status-qualified">
                <CheckCircle2 className="h-4 w-4" />
                {result.imported} immobil{result.imported === 1 ? "e" : "i"} importat
                {result.imported === 1 ? "o" : "i"}.
              </p>
            )}
            {result.truncated && (
              <p className="text-xs text-muted-foreground">
                Il file ha più righe di quante se ne possano importare insieme: carica il resto in un
                secondo file.
              </p>
            )}
            {result.errors.length > 0 && (
              <div className="rounded-lg border border-status-blocked/30 bg-status-blocked/5 p-2.5">
                <p className="flex items-center gap-1.5 text-xs font-medium text-status-blocked">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {result.errors.length} rig{result.errors.length === 1 ? "a" : "he"} da correggere
                </p>
                <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      Riga {e.line}
                      {e.reference ? ` (${e.reference})` : ""}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="btn-outline text-xs">
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
