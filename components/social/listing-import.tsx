"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Wand2 } from "lucide-react";
import { IMPORT_PROGRESS, ProgressMessages } from "@/components/shared/progress-messages";

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

/**
 * Compilazione automatica della scheda immobile a partire dal testo.
 *
 * Il recupero da link è stato rimosso: i portali italiani bloccano
 * sistematicamente le richieste automatiche, e le due schede "Da link" /
 * "Da testo" finivano quasi sempre sulla seconda dopo un avviso di errore —
 * una scelta apparente che nei fatti costava all'agente un tentativo a vuoto
 * e un messaggio d'allarme prima di arrivare all'unica strada percorribile.
 * Una sola casella, nessun bivio.
 */
export function ListingImport({ onImported, onLocked }: ListingImportProps) {
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
        body: JSON.stringify({ rawText }),
      });

      if (response.status === 402) {
        onLocked();
        return;
      }

      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "Compilazione non riuscita.");
        return;
      }

      const listing = body.listing as ImportedListingView;
      setMissingInfo(listing.missingInfo ?? []);
      onImported(listing);
    } catch {
      setError("Errore di rete durante la compilazione.");
    } finally {
      setIsImporting(false);
    }
  }

  const canImport = rawText.trim().length > 30;

  return (
    <section className="rounded-xl border border-primary/25 bg-primary/5 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Wand2 className="h-4 w-4 text-primary" />
        Importa da Testo Grezzo o Scheda
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Incolla qui il testo dell&apos;annuncio (da Immobiliare.it, Idealista, email o gestionale) e
        clicca su Compila i campi per estrarre automaticamente i dati.
      </p>

      <div className="mt-4">
        <label htmlFor="listing-text" className="sr-only">
          Testo dell&apos;annuncio
        </label>
        <textarea
          id="listing-text"
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          rows={6}
          placeholder="Incolla qui il testo della scheda immobile o dell'annuncio…"
          className="input-field bg-card"
          aria-describedby="listing-text-help"
        />
        <p id="listing-text-help" className="mt-1.5 text-xs text-muted-foreground">
          Bastano i dati essenziali dell&apos;immobile: tipologia, metratura, zona, prezzo e
          caratteristiche. L&apos;AI userà solo ciò che è scritto, senza inventare nulla.
        </p>
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
          <p className="text-xs font-medium text-foreground">Dati non presenti nel testo</p>
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
