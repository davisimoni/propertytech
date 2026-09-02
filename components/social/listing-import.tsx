"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Link2, Loader2, Wand2 } from "lucide-react";
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
  /**
   * Testo controllato dal componente padre: serve anche al pulsante "Genera",
   * che può inviarlo direttamente all'AI saltando la compilazione dei campi.
   */
  rawText: string;
  onRawTextChange: (value: string) => void;
  /** Riempie il form principale con i dati estratti. */
  onImported: (listing: ImportedListingView) => void;
  onLocked: () => void;
}

/**
 * Compilazione automatica della scheda immobile: da link o da testo.
 *
 * # Perché il link sta sopra e il testo sotto
 *
 * Perché il link è il tentativo veloce e il testo è la strada che funziona
 * sempre. Quando un portale ci blocca — e i tre maggiori lo fanno quasi
 * sempre, vedi `lib/listings/url-extract.ts` — il messaggio dice di incollare
 * il testo "nel box sottostante", e quel box dev'essere davvero sotto: un
 * rimando che punta nella direzione sbagliata costa all'agente il tempo di
 * cercarlo.
 *
 * Il riquadro del testo non è un ripiego: copre anche le fonti che nessun
 * link raggiunge — una scheda di gestionale, l'email di un collega, un PDF.
 */
export function ListingImport({
  rawText,
  onRawTextChange,
  onImported,
  onLocked,
}: ListingImportProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [url, setUrl] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);

  /** Serve a portare il cursore nel riquadro quando il portale blocca il link. */
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleImport() {
    setIsImporting(true);
    setError(null);

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

      // `missingInfo` non viene più mostrato qui: elencare ciò che manca
      // subito dopo una compilazione riuscita si leggeva come un blocco,
      // mentre i campi si erano popolati regolarmente. Chi vuole integrare
      // vede già i campi vuoti sotto, che è un'informazione più diretta.
      onImported(body.listing as ImportedListingView);
    } catch {
      setError("Errore di rete durante la compilazione.");
    } finally {
      setIsImporting(false);
    }
  }

  async function handleExtractUrl() {
    setIsExtracting(true);
    setError(null);

    try {
      const response = await fetch("/api/social/extract-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (response.status === 402) {
        onLocked();
        return;
      }

      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "Non è stato possibile leggere il link.");
        // Il messaggio rimanda al riquadro del testo: portarci il cursore
        // trasforma un'istruzione in un gesto già iniziato.
        textareaRef.current?.focus();
        return;
      }

      // Il testo estratto finisce nel riquadro insieme ai campi compilati: se
      // il modello ha letto male un dato, l'agente ha la fonte davanti da
      // correggere invece di dover riaprire il link e ricopiare tutto.
      if (typeof body.rawText === "string") onRawTextChange(body.rawText);
      onImported(body.listing as ImportedListingView);
    } catch {
      setError("Errore di rete durante la lettura del link.");
    } finally {
      setIsExtracting(false);
    }
  }

  const canImport = rawText.trim().length > 30;
  const canExtract = /^https?:\/\/\S+$/i.test(url.trim());
  const isBusy = isImporting || isExtracting;

  return (
    <section className="rounded-xl border border-primary/25 bg-primary/5 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Wand2 className="h-4 w-4 text-primary" />
        Compila la scheda da un link o da un testo
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Incolla il link dell&apos;annuncio, oppure il testo copiato da un portale, da
        un&apos;email o dal gestionale: l&apos;AI ne ricava i dati dell&apos;immobile.
      </p>

      {/* --- Da link --- */}
      <div className="mt-4">
        <label htmlFor="listing-url" className="block text-xs font-medium text-foreground">
          Incolla il link dell&apos;annuncio
        </label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input
            id="listing-url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…"
            className="input-field bg-card sm:flex-1"
            aria-describedby="listing-url-help"
            disabled={isBusy}
          />
          <button
            type="button"
            onClick={handleExtractUrl}
            disabled={!canExtract || isBusy}
            className="btn-brand shrink-0 justify-center"
          >
            {isExtracting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            {isExtracting ? "Lettura del link…" : "Estrai da Link"}
          </button>
        </div>
        <p id="listing-url-help" className="mt-1.5 text-xs text-muted-foreground">
          Ideale per il sito della tua agenzia, i portali locali, il gestionale e le pagine che si
          caricano da sole. <span className="font-medium text-foreground">Immobiliare.it e
          Idealista</span> respingono le letture automatiche: per quei due usa direttamente il
          riquadro qui sotto.
        </p>
      </div>

      {/* --- Oppure da testo --- */}
      <div className="mt-4 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          oppure
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="mt-4">
        <label htmlFor="listing-text" className="block text-xs font-medium text-foreground">
          Incolla il testo dell&apos;annuncio
        </label>
        <textarea
          id="listing-text"
          ref={textareaRef}
          value={rawText}
          onChange={(event) => onRawTextChange(event.target.value)}
          rows={6}
          placeholder="Incolla qui il testo della scheda immobile o dell'annuncio…"
          className="input-field mt-1.5 bg-card"
          aria-describedby="listing-text-help"
        />
        <p id="listing-text-help" className="mt-1.5 text-xs text-muted-foreground">
          Il metodo più rapido e sempre valido, anche per i portali protetti. Bastano i dati
          essenziali: tipologia, metratura, zona, prezzo e caratteristiche. L&apos;AI userà solo
          ciò che è scritto, senza inventare nulla.
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

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleImport}
          disabled={!canImport || isBusy}
          className="btn-brand"
        >
          {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {isImporting ? "Lettura in corso…" : "Compila i campi"}
        </button>
        {/* Detto qui perché è la domanda che sorge davanti a due pulsanti che
            sembrano fare la stessa cosa: questo serve solo a rileggere e
            correggere i dati prima di generare, non è un passaggio dovuto. */}
        <p className="text-xs text-muted-foreground">
          Facoltativo: serve a rivedere i dati prima di generare. Puoi anche generare
          direttamente dal testo.
        </p>
      </div>

      {isBusy && <ProgressMessages messages={IMPORT_PROGRESS} className="mt-3 block" />}
    </section>
  );
}
