/**
 * Cronologia delle elaborazioni AI.
 *
 * Modulo puro: costruisce anteprime e normalizza le due sorgenti — le
 * elaborazioni di `AiGeneration` e i report vocali di `VoiceReport` — in una
 * forma unica, così la stessa vista serve tutti e tre i moduli.
 *
 * I report vocali non sono stati travasati in `AiGeneration`: hanno campi e
 * stato di invio propri, e migrarli avrebbe significato toccare PDF e invio al
 * proprietario per un guadagno solo estetico. Si unificano in lettura.
 */

/** Tipi mostrabili in cronologia, compresi i report vocali. */
export type HistoryKind = "DOCUMENT_EXTRACTION" | "LISTING" | "SOCIAL" | "VOICE_REPORT";

export const HISTORY_KIND_LABELS: Record<HistoryKind, string> = {
  DOCUMENT_EXTRACTION: "Analisi documento",
  LISTING: "Annuncio portali",
  SOCIAL: "Contenuti social",
  VOICE_REPORT: "Report post-visita",
};

export function isHistoryKind(value: unknown): value is HistoryKind {
  return typeof value === "string" && value in HISTORY_KIND_LABELS;
}

/** Voce di cronologia, nella forma che la UI consuma. */
export interface HistoryEntry {
  id: string;
  kind: HistoryKind;
  title: string;
  preview: string;
  createdAt: string;
  /** Nome di chi l'ha lanciata, quando disponibile. */
  authorName: string | null;
  /** Vero se il dettaglio si può scaricare in PDF. */
  hasPdf: boolean;
}

/** Quante voci per pagina. Basse: l'elenco si scorre, non si studia. */
export const HISTORY_PAGE_SIZE = 20;

/** Lunghezza massima dell'anteprima salvata a fianco del risultato. */
export const PREVIEW_MAX_LENGTH = 240;

/**
 * Riduce un testo lungo a un'anteprima da elenco.
 *
 * Taglia sull'ultimo spazio invece che a metà parola: "Trilocale ristruttur…"
 * si legge, "Trilocale ristrutt" sembra un dato corrotto.
 */
export function toPreview(text: string, maxLength = PREVIEW_MAX_LENGTH): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;

  const cut = clean.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Anteprima di un'estrazione documentale.
 *
 * Sceglie i campi che identificano *quale* visura è, non i primi che capitano:
 * dopo venti estrazioni l'agente riconosce la sua da comune, foglio e
 * particella, non dalla rendita.
 */
export function previewFromExtraction(extraction: unknown): string {
  if (!extraction || typeof extraction !== "object") return "Estrazione senza dati leggibili";

  const data = extraction as Record<string, unknown>;
  const parts: string[] = [];

  const push = (label: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) parts.push(`${label} ${value.trim()}`);
    else if (typeof value === "number") parts.push(`${label} ${value}`);
  };

  push("Comune", data.comune);
  push("Foglio", data.foglio);
  push("Part.", data.particella);
  push("Sub.", data.subalterno);
  push("Cat.", data.categoriaCatastale);

  if (parts.length === 0) {
    const owners = data.intestatari;
    if (Array.isArray(owners) && owners.length > 0) {
      const names = owners
        .map((owner) =>
          owner && typeof owner === "object"
            ? String((owner as Record<string, unknown>).nome ?? "").trim()
            : String(owner).trim()
        )
        .filter(Boolean);
      if (names.length) return toPreview(`Intestatari: ${names.join(", ")}`);
    }
    return "Estrazione completata";
  }

  return toPreview(parts.join(" · "));
}

/**
 * Anteprima dei contenuti generati dal Modulo 3.
 *
 * L'annuncio per i portali viene prima dei post: è il testo che l'agente
 * riconosce, e i post social cominciano quasi tutti con un'emoji che in elenco
 * non distingue nulla.
 */
export function previewFromContent(content: unknown): string {
  if (!content || typeof content !== "object") return "Contenuti generati";

  const data = content as Record<string, unknown>;

  for (const key of ["annuncio", "portale", "listing", "instagram", "facebook", "reel", "tiktok"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return toPreview(value);
  }

  const firstText = Object.values(data).find(
    (value) => typeof value === "string" && value.trim().length > 0
  );

  return typeof firstText === "string" ? toPreview(firstText) : "Contenuti generati";
}

/** Nome leggibile di chi ha lanciato l'elaborazione. */
export function authorLabel(
  user: { firstName: string | null; lastName: string | null; email: string } | null
): string | null {
  if (!user) return null;

  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return full || user.email;
}
