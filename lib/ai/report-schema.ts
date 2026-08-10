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
});

export type VoiceReportContent = z.infer<typeof voiceReportSchema>;

/** Payload accettato da /api/reports/voice-to-report nella variante testuale. */
export const reportRequestSchema = z.object({
  propertyRef: z.string().min(3, "Riferimento immobile obbligatorio").max(200),
  sellerName: z.string().max(120).optional(),
  sellerPhone: z.string().max(20).optional(),
  notes: z.string().min(20, "La nota è troppo breve per generare un report").max(8000),
});
