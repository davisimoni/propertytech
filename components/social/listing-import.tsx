"use client";

import { useState } from "react";
import { AlertTriangle, ClipboardPaste, Link2, Loader2, Wand2 } from "lucide-react";
import { IMPORT_PROGRESS, ProgressMessages } from "@/components/shared/progress-messages";
import { cn } from "@/lib/utils";

export interface ImportedListingView {
  propertyTitle: string;
  keyPoints: string;
  zone: string | null;
  squareMeters: string | null;
  price: string | null;
  rooms: string | null;
  strengths: string[];
  missingInfo: string[];
}

interface ListingImportProps {
  /** Riempie il form principale con i dati estratti. */
  onImported: (listing: ImportedListingView) => void;
  onLocked: () => void;
}

type Mode = "link" | "text";

export function ListingImport({ onImported, onLocked }: ListingImportProps) {
  const [mode, setMode] = useState<Mode>("link");
  const [url, setUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingInfo, setMissingInfo] = useState<string[]>([]);

  async function handleImport() {
    setIsImporting(true);
    setError(null);
    setMissingInfo([]);

    try {
      const response = await fetch("/api/social/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "link" ? { url } : { rawText }),
      });

      if (response.status === 402) {
        onLocked();
        return;
      }

      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "Import non riuscito.");
        // Solo quando è il portale a respingerci il percorso testuale è la via
        // d'uscita, e ci si sposta da soli. Su un link scritto male (o su un
        // indirizzo non raggiungibile) spostare la scheda sarebbe dannoso:
        // nasconderebbe il campo che l'agente deve correggere.
        if (body.error === "portal_blocked") setMode("text");
        return;
      }

      const listing = body.listing as ImportedListingView;
      setMissingInfo(listing.missingInfo ?? []);
      onImported(listing);
    } catch {
      setError("Errore di rete durante l'import.");
    } finally {
      setIsImporting(false);
    }
  }

  const canImport = mode === "link" ? url.trim().length > 8 : rawText.trim().length > 30;

  return (
    <section className="rounded-xl border border-primary/25 bg-primary/5 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Wand2 className="h-4 w-4 text-primary" />
        Importa da Link o Testo Grezzo
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Incolla il link dell&apos;annuncio da Immobiliare.it o Idealista, oppure il testo della
        scheda dal tuo gestionale: compilo io i campi qui sotto.
      </p>

      <div className="mt-4 flex gap-2">
        {(
          [
            { value: "link", label: "Da link", icon: Link2 },
            { value: "text", label: "Da testo", icon: ClipboardPaste },
          ] as const
        ).map((option) => {
          const Icon = option.icon;
          const isActive = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              aria-pressed={isActive}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200",
                isActive
                  ? "bg-brand-gradient text-white shadow-sm"
                  : "border border-border bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        {mode === "link" ? (
          <>
            <label htmlFor="listing-url" className="sr-only">
              Link dell&apos;annuncio
            </label>
            <input
              id="listing-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.immobiliare.it/annunci/..."
              className="input-field bg-card"
              aria-describedby="listing-url-help"
            />
            <p id="listing-url-help" className="mt-1.5 text-xs text-muted-foreground">
              Incolla il link dell&apos;immobile: l&apos;AI estrae automaticamente zona, superficie,
              locali e prezzo, e compila la scheda al posto tuo.
            </p>
          </>
        ) : (
          <>
            <label htmlFor="listing-text" className="sr-only">
              Testo dell&apos;annuncio
            </label>
            <textarea
              id="listing-text"
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              rows={5}
              placeholder="Incolla qui il testo della scheda immobile o dell'annuncio…"
              className="input-field bg-card"
              aria-describedby="listing-text-help"
            />
            <p id="listing-text-help" className="mt-1.5 text-xs text-muted-foreground">
              Va bene anche il testo copiato da un portale, da un&apos;email o dalla scheda del
              gestionale: bastano i dati essenziali dell&apos;immobile.
            </p>
          </>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg border border-status-pending/30 bg-status-pending/10 p-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-pending" />
          <p className="text-xs text-foreground">{error}</p>
        </div>
      )}

      {missingInfo.length > 0 && (
        <div className="mt-3 rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-medium text-foreground">Dati non presenti nella fonte</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Aggiungili a mano nei punti chiave se li conosci: {missingInfo.join(", ")}.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={handleImport}
        disabled={!canImport || isImporting}
        className="btn-brand mt-4"
      >
        {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        {isImporting ? "Lettura in corso…" : "Compila i campi"}
      </button>

      {isImporting && <ProgressMessages messages={IMPORT_PROGRESS} className="mt-3 block" />}
    </section>
  );
}
