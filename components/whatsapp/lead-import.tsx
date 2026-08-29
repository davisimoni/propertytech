"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import {
  IMPORT_FIELDS,
  IMPORT_FIELD_LABELS,
  type ImportField,
} from "@/lib/leads/import-mapping";
import { cn } from "@/lib/utils";

interface SkippedRow {
  line: number;
  error?: string;
}

interface PreviewResponse {
  headers: string[];
  delimiter: string;
  mapping: Record<string, ImportField>;
  totalRows: number;
  validCount: number;
  duplicatesInFile: number;
  alreadyPresent: number;
  willCreate: number;
  sample: { clientName: string; clientPhone: string; clientEmail: string | null }[];
  skipped: SkippedRow[];
  skippedTotal: number;
}

interface ImportResult {
  imported: number;
  skipped: number;
  duplicates: number;
}

/**
 * Importazione della rubrica da CSV.
 *
 * Due passaggi: prima l'anteprima, poi la scrittura. Disfare un'importazione
 * sbagliata di ottocento schede costa molto più che guardare un riepilogo, e
 * l'errore tipico non è il file — è una colonna abbinata al campo sbagliato.
 */
export function LeadImport({
  isOpen,
  onOpenChange,
  onImported,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, ImportField>>({});
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setPreview(null);
    setMapping({});
    setError(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function close() {
    onOpenChange(false);
    reset();
  }

  async function analyse(selected: File) {
    setIsBusy(true);
    setError(null);
    setResult(null);

    try {
      const body = new FormData();
      body.append("file", selected);

      const response = await fetch("/api/leads/import", { method: "POST", body });
      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? "Lettura del file non riuscita.");
        setPreview(null);
        return;
      }

      setPreview(data as PreviewResponse);
      setMapping((data as PreviewResponse).mapping);
      setFile(selected);
    } catch {
      setError("Errore di rete durante la lettura del file.");
    } finally {
      setIsBusy(false);
    }
  }

  async function confirm() {
    if (!file) return;

    setIsBusy(true);
    setError(null);

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("mapping", JSON.stringify(mapping));

      const response = await fetch("/api/leads/import", { method: "PUT", body });
      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? "Importazione non riuscita.");
        return;
      }

      setResult(data as ImportResult);
      setPreview(null);
      onImported();
    } catch {
      setError("Errore di rete durante l'importazione.");
    } finally {
      setIsBusy(false);
    }
  }

  /** Il campo assegnato a una colonna, o "" se la colonna va ignorata. */
  function fieldFor(index: number): ImportField | "" {
    return mapping[String(index)] ?? "";
  }

  function setField(index: number, field: ImportField | "") {
    setMapping((current) => {
      const next = { ...current };

      // Un campo può stare su una sola colonna: assegnandolo altrove va tolto
      // da dove stava, o due colonne finirebbero sullo stesso dato.
      if (field) {
        for (const key of Object.keys(next)) {
          if (next[key] === field) delete next[key];
        }
        next[String(index)] = field;
      } else {
        delete next[String(index)];
      }

      return next;
    });
  }

  const hasPhone = Object.values(mapping).includes("phone");
  const hasName =
    Object.values(mapping).includes("fullName") ||
    Object.values(mapping).includes("firstName");

  if (!isOpen) {
    return (
      <button type="button" onClick={() => onOpenChange(true)} className="btn-outline">
        <Upload className="h-4 w-4" aria-hidden="true" />
        Importa rubrica
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Importa la tua rubrica</h3>
            <p className="text-sm text-muted-foreground">
              Carica un file CSV. Da Excel: <span className="font-medium">File → Salva con nome →
              CSV UTF-8</span>.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Chiudi importazione"
          className="inline-flex h-11 w-11 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-all duration-200 hover:bg-muted"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* --- Scelta del file --- */}
      {!preview && !result && (
        <div className="mt-4">
          <label
            htmlFor="import-file"
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border px-4 py-8 text-center transition-colors duration-200 hover:border-primary/40 hover:bg-muted/40"
          >
            {isBusy ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : (
              <Upload className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="mt-2 text-sm font-medium text-foreground">
              {isBusy ? "Lettura del file…" : "Scegli un file CSV"}
            </span>
            <span className="mt-0.5 text-xs text-muted-foreground">Massimo 2 MB, 5.000 righe</span>
          </label>
          <input
            ref={inputRef}
            id="import-file"
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) void analyse(selected);
            }}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-status-blocked">
          {error}
        </p>
      )}

      {/* --- Anteprima e abbinamento --- */}
      {preview && (
        <div className="mt-5">
          <div className="grid gap-2 sm:grid-cols-4">
            <Stat label="Righe lette" value={preview.totalRows} />
            <Stat label="Contatti validi" value={preview.validCount} />
            <Stat label="Già in archivio" value={preview.alreadyPresent} />
            <Stat label="Da creare" value={preview.willCreate} highlight />
          </div>

          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Abbinamento delle colonne
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Abbiamo riconosciuto le colonne dal titolo. Controlla e correggi dove serve.
          </p>

          <div className="mt-3 space-y-2">
            {preview.headers.map((header, index) => (
              <div key={`${header}-${index}`} className="grid grid-cols-2 items-center gap-2">
                <label
                  htmlFor={`col-${index}`}
                  className="truncate text-xs text-foreground"
                  title={header}
                >
                  {header || <span className="text-muted-foreground">(colonna senza titolo)</span>}
                </label>
                <select
                  id={`col-${index}`}
                  value={fieldFor(index)}
                  onChange={(event) => setField(index, event.target.value as ImportField | "")}
                  className="input-field text-xs"
                >
                  <option value="">Non importare</option>
                  {IMPORT_FIELDS.map((field) => (
                    <option key={field} value={field}>
                      {IMPORT_FIELD_LABELS[field]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {(!hasPhone || !hasName) && (
            <p role="alert" className="mt-3 flex items-start gap-1.5 text-xs text-status-blocked">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Servono almeno una colonna nome e una telefono: senza numero il contatto non è
              raggiungibile su WhatsApp.
            </p>
          )}

          {preview.sample.length > 0 && (
            <>
              <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Primi contatti riconosciuti
              </h4>
              <ul className="mt-2 space-y-1">
                {preview.sample.map((row, i) => (
                  <li key={i} className="truncate rounded-lg bg-muted/50 px-3 py-2 text-xs text-foreground">
                    <span className="font-medium">{row.clientName}</span>
                    <span className="text-muted-foreground"> · +{row.clientPhone}</span>
                    {row.clientEmail && (
                      <span className="text-muted-foreground"> · {row.clientEmail}</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {preview.skippedTotal > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                {preview.skippedTotal} righe non importabili
              </summary>
              <ul className="mt-2 space-y-1">
                {preview.skipped.map((row) => (
                  <li key={row.line} className="text-xs text-muted-foreground">
                    Riga {row.line}: {row.error}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={confirm}
              disabled={isBusy || !hasPhone || !hasName || preview.willCreate === 0}
              className="btn-brand shrink-0 disabled:opacity-60"
            >
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="h-4 w-4" aria-hidden="true" />
              )}
              Importa {preview.willCreate} contatti
            </button>
            <button type="button" onClick={reset} className="btn-outline shrink-0">
              Cambia file
            </button>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            I contatti entrano in pipeline come <span className="font-medium">Da contattare</span>:
            non parte nessun messaggio automatico. Decidi tu chi ingaggiare.
          </p>
        </div>
      )}

      {/* --- Esito --- */}
      {result && (
        <div role="status" className="mt-5 rounded-xl border border-status-qualified/40 bg-status-qualified/5 p-4">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-status-qualified" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {result.imported} contatti importati
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {result.duplicates > 0 && `${result.duplicates} già presenti e non duplicati. `}
                {result.skipped > 0 && `${result.skipped} righe scartate per dati mancanti.`}
              </p>
              <button type="button" onClick={reset} className="btn-outline mt-3">
                Importa un altro file
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        highlight ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30"
      )}
    >
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
