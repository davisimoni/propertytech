import type { ReactElement } from "react";
import type { PdfBranding } from "./document-pdf";

/**
 * Generazione del PDF nel browser.
 *
 * `@react-pdf/renderer` viene importato in modo dinamico: pesa qualche centinaio
 * di kilobyte, e caricarlo all'apertura della pagina rallenterebbe tutti per una
 * funzione che usa chi preme un pulsante.
 */

/** Intestazione di riserva quando il profilo non è leggibile. */
const FALLBACK_BRANDING: PdfBranding = {
  agencyName: "Agenzia",
  legalName: null,
  logoDataUrl: null,
};

/**
 * Legge l'intestazione dell'agenzia.
 *
 * Non lancia: un profilo irraggiungibile deve produrre un PDF con
 * un'intestazione sobria, non un download fallito.
 */
export async function fetchPdfBranding(): Promise<PdfBranding> {
  try {
    const response = await fetch("/api/user/branding");
    if (!response.ok) return FALLBACK_BRANDING;

    const data = (await response.json()) as Partial<PdfBranding>;

    return {
      agencyName: data.agencyName || FALLBACK_BRANDING.agencyName,
      legalName: data.legalName ?? null,
      // `@react-pdf/renderer` sa leggere solo JPEG e PNG: un logo WebP — che il
      // pannello branding accetta — farebbe fallire l'intero documento. Meglio
      // un'intestazione col nome dell'agenzia che nessun PDF.
      logoDataUrl: isPdfSafeImage(data.logoDataUrl) ? data.logoDataUrl! : null,
    };
  } catch {
    return FALLBACK_BRANDING;
  }
}

/** Formati immagine che @react-pdf/renderer sa impaginare. */
export function isPdfSafeImage(dataUrl: string | null | undefined): boolean {
  if (!dataUrl) return false;
  return /^data:image\/(png|jpe?g);base64,/i.test(dataUrl);
}

/**
 * Rende il documento e avvia il download.
 *
 * L'object URL viene revocato dopo un attimo e non subito: alcuni browser
 * annullano il download se la sorgente sparisce nello stesso ciclo in cui si
 * simula il clic.
 */
export async function downloadPdf(document_: ReactElement, fileName: string): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");

  const blob = await pdf(document_ as Parameters<typeof pdf>[0]).toBlob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
