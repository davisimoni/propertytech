"use client";

import { useState, type ReactElement } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { downloadPdf, fetchPdfBranding } from "@/lib/pdf/client";
import type { PdfBranding } from "@/lib/pdf/document-pdf";
import { cn } from "@/lib/utils";

interface DownloadPdfButtonProps {
  /** Costruisce il documento una volta nota l'intestazione dell'agenzia. */
  buildDocument: (branding: PdfBranding) => ReactElement;
  /** Nome del file scaricato, già parlante. */
  fileName: string;
  label?: string;
  className?: string;
}

/**
 * Scarica un PDF generato **nel browser**.
 *
 * Prima la generazione avveniva sul server e falliva sempre: nelle route
 * handler Next usa un React vendorizzato 19.2, mentre il reconciler di
 * @react-pdf sceglie la propria variante dalla versione di React che importa
 * lui (18.3.1 da node_modules) e si aspetta elementi con una firma diversa da
 * quella che la rotta produce. Nel bundle del browser c'è un solo React e il
 * problema non esiste — in più il rendering non consuma tempo di funzione
 * serverless.
 */
export function DownloadPdfButton({
  buildDocument,
  fileName,
  label = "Scarica Report PDF",
  className,
}: DownloadPdfButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsGenerating(true);
    setError(null);

    try {
      const branding = await fetchPdfBranding();
      await downloadPdf(buildDocument(branding), fileName);
    } catch (cause) {
      console.error("[pdf] Generazione non riuscita", cause);
      setError("Impossibile generare il PDF. Riprova.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className={cn("inline-flex flex-col gap-1", className)}>
      {/* `btn-brand`: è l'azione conclusiva del modulo — l'agente arriva qui
          per portarsi via il documento — e in mezzo a pulsanti dal bordo
          chiaro deve restare quella riconoscibile a colpo d'occhio. */}
      <button
        type="button"
        onClick={handleClick}
        disabled={isGenerating}
        className="btn-brand disabled:opacity-60"
      >
        {isGenerating ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <FileDown className="h-4 w-4" aria-hidden="true" />
        )}
        {isGenerating ? "Preparo il PDF…" : label}
      </button>

      {error && (
        <p role="alert" className="text-xs text-status-blocked">
          {error}
        </p>
      )}
    </div>
  );
}
