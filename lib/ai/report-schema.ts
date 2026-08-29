import { z } from "zod";

export const FEEDBACK_CATEGORIES = [
  "prezzo",
  "stato_immobile",
  "posizione",
  "interesse_reale",
  "altro",
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  prezzo: "Prezzo",
  stato_immobile: "Stato dell'immobile",
  posizione: "Posizione",
  interesse_reale: "Interesse reale",
  altro: "Altro",
};

export const SENTIMENT_LABELS = {
  positivo: "Positivo",
  neutro: "Neutro",
  negativo: "Negativo",
} as const;

export const voiceReportSchema = z.object({
  visitSummary: z
    .string()
    .describe("Sintesi della visita in 2-3 frasi, destinata al proprietario dell'immobile."),
  interestLevel: z
    .enum(["alto", "medio", "basso"])
    .describe("Livello di interesse reale del potenziale acquirente, dedotto dalla nota."),
  visitorCount: z
    .number()
    .int()
    .nullable()
    .describe(
      "Quante persone hanno partecipato alla visita, SOLO se il numero e' detto esplicitamente nella nota (es. 'sono venuti in quattro'). null se non e' dichiarato: non dedurlo e non stimarlo."
    ),
  feedback: z
    .array(
      z.object({
        category: z
          .enum(FEEDBACK_CATEGORIES)
          .describe("Categoria del feedback espresso durante la visita."),
        sentiment: z
          .enum(["positivo", "neutro", "negativo"])
          .describe("Tono del feedback rispetto a questa categoria."),
        detail: z
          .string()
          .describe("Il feedback riformulato in modo professionale e non offensivo per il proprietario."),
      })
    )
    .describe("Feedback della visita, categorizzati. Includi solo ciò che emerge dalla nota."),
  priceObservation: z
    .string()
    .nullable()
    .describe(
      "Osservazione specifica sul prezzo emersa dalla visita (es. scostamento percepito rispetto al mercato); null se il prezzo non è stato discusso."
    ),
  recommendedActions: z
    .array(z.string())
    .describe(
      "1-3 azioni concrete e realistiche che il proprietario può valutare per facilitare la vendita."
    ),
  sellerMessage: z
    .string()
    .describe(
      "Messaggio breve (max 700 caratteri) pronto per l'invio via WhatsApp al proprietario: cortese, professionale, sintetizza esito e prossimi passi."
    ),
  /**
   * Sintesi interna per l'agente e il team.
   *
   * Vive nello stesso oggetto ma **non esce mai dall'agenzia**: non entra nel
   * PDF consegnato al proprietario (`lib/pdf/seller-report-document.tsx`
   * elenca i campi uno per uno) né nel messaggio WhatsApp inviato al
   * venditore. È l'unico punto del report dove il linguaggio resta quello
   * schietto della nota originale, senza la riformulazione di cortesia.
   */
  agentSummary: z
    .object({
      keyPoints: z
        .array(z.string())
        .describe(
          "2-4 punti chiave della visita per il team, in linguaggio interno e diretto: cosa è successo davvero."
        ),
      technicalFeedback: z
        .array(z.string())
        .describe(
          "Rilievi tecnici e operativi utili all'agenzia (stato dell'immobile, lavori necessari, criticità di visita, elementi che rallentano la vendita). Vuoto se la nota non ne contiene."
        ),
      objections: z
        .array(z.string())
        .describe(
          "Obiezioni sollevate dal potenziale acquirente, riportate senza addolcirle: servono a preparare la trattativa. Vuoto se non ne sono emerse."
        ),
      nextAction: z
        .string()
        .describe(
          "La singola azione più utile che l'agente dovrebbe compiere adesso, concreta e derivata dalla nota (es. 'richiamare i Rossi entro 48h con una controproposta a 235.000€')."
        ),
    })
    .describe("Sintesi interna per l'agente e il team. Non destinata al proprietario."),
});

export type VoiceReportContent = z.infer<typeof voiceReportSchema>;

/**
 * Forma minima per **rileggere** un report già salvato e inviarlo al
 * proprietario.
 *
 * Deliberatamente separata da `voiceReportSchema`, che descrive ciò che il
 * modello deve produrre *oggi*: i report generati prima dell'introduzione di
 * `agentSummary` non hanno quel campo, e validarli contro lo schema completo
 * li dichiarerebbe tutti non validi — l'agenzia si ritroverebbe di colpo
 * impossibilitata a inviare report perfettamente buoni, generati la settimana
 * prima. Chi invia ha bisogno di un solo campo: si valida quello.
 */
export const storedReportForSendingSchema = z.object({
  sellerMessage: z.string().min(1),
});

/** Payload accettato da /api/reports/voice-to-report nella variante testuale. */
export const reportRequestSchema = z.object({
  propertyRef: z.string().min(3, "Riferimento immobile obbligatorio").max(200),
  sellerName: z.string().max(120).optional(),
  sellerPhone: z.string().max(20).optional(),
  notes: z.string().min(20, "La nota è troppo breve per generare un report").max(8000),
});
