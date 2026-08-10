/**
 * Nomi file dei PDF scaricati.
 *
 * Modulo puro e isomorfo: lo stesso nome vale sul client che genera il file e
 * ovunque serva citarlo.
 *
 * Un nome parlante non è un vezzo: un agente scarica dieci schede in una
 * mattina e poi deve ritrovarne una nella cartella Download. "documento.pdf"
 * ripetuto dieci volte diventa "documento (7).pdf", e nessuno sa più quale sia.
 */

/**
 * Ripulisce un segmento di nome file.
 *
 * Accenti trasposti (`città` → `citta`), spazi e punteggiatura ridotti a
 * underscore singoli: quel che resta è sicuro su Windows, macOS e Linux, e non
 * contiene separatori di percorso.
 */
export function slugSegment(value: string, maxLength = 40): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength);
}

/**
 * Compone un nome file dai segmenti non vuoti.
 *
 * I segmenti assenti vengono saltati invece di lasciare underscore doppi o un
 * "Foglio_" senza numero — che è precisamente ciò che succede concatenando
 * campi opzionali senza filtrarli.
 */
export function buildPdfFileName(segments: (string | null | undefined)[]): string {
  const parts = segments
    .map((segment) => (segment ? slugSegment(String(segment)) : ""))
    .filter(Boolean);

  return `${parts.join("_") || "Documento"}.pdf`;
}

/** Nome della scheda catastale: `Report_Analisi_Catastale_Foglio_312.pdf`. */
export function extractionFileName(immobile: {
  comune?: string | null;
  foglio?: string | null;
  particella?: string | null;
}): string {
  return buildPdfFileName([
    "Report_Analisi_Catastale",
    immobile.comune ? slugSegment(immobile.comune, 24) : null,
    immobile.foglio ? `Foglio_${slugSegment(immobile.foglio, 10)}` : null,
    immobile.particella ? `Part_${slugSegment(immobile.particella, 10)}` : null,
  ]);
}

/** Nome del report post-visita: `Report_Visita_RIF_A12_Mario_Rossi.pdf`. */
export function sellerReportFileName(report: {
  propertyRef?: string | null;
  sellerName?: string | null;
}): string {
  return buildPdfFileName([
    "Report_Visita",
    report.propertyRef ?? null,
    report.sellerName ?? null,
  ]);
}
