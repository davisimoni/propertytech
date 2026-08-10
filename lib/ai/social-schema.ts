import { z } from "zod";

export const TONE_OPTIONS = ["professionale", "emozionale", "lussuoso", "giovane"] as const;

export type ToneOfVoice = (typeof TONE_OPTIONS)[number];

export const TONE_LABELS: Record<ToneOfVoice, string> = {
  professionale: "Professionale",
  emozionale: "Emozionale",
  lussuoso: "Lussuoso",
  giovane: "Giovane / Dinamico",
};

/** Payload accettato da /api/social/generate. */
export const socialGenerationRequestSchema = z.object({
  propertyTitle: z.string().min(3, "Titolo troppo corto").max(150),
  keyPoints: z
    .string()
    .min(10, "Inserisci almeno qualche punto chiave sull'immobile")
    .max(2000),
  tone: z.enum(TONE_OPTIONS),
});

export type SocialGenerationRequest = z.infer<typeof socialGenerationRequestSchema>;

export const socialContentSchema = z.object({
  portalListing: z.object({
    title: z.string().describe("Titolo dell'annuncio per il portale, max 80 caratteri, con la zona."),
    body: z
      .string()
      .describe(
        "Testo dell'annuncio per Immobiliare.it/Idealista: 150-250 parole, paragrafi brevi, ottimizzato per la ricerca locale (zona, quartiere, città, tipologia). Nessun markdown."
      ),
    seoKeywords: z
      .array(z.string())
      .describe("5-8 parole chiave di ricerca locale usate nel testo, es. 'trilocale centro Milano'."),
  }),
  socialPost: z.object({
    caption: z
      .string()
      .describe(
        "Caption per Instagram/Facebook con emoji pertinenti, 60-120 parole, righe brevi e una call to action finale."
      ),
    hashtags: z
      .array(z.string())
      .describe(
        "10-15 hashtag senza il simbolo '#', misto fra generici del settore e di zona (es. 'casamilano', 'immobiliaremilano')."
      ),
  }),
  reelScript: z.object({
    hook: z.string().describe("Frase d'apertura di massimo 8 parole per i primi 3 secondi del video."),
    scenes: z
      .array(
        z.object({
          timeRange: z.string().describe("Intervallo temporale della scena, es. '0-5s'."),
          voiceover: z.string().describe("Cosa dice l'agente in questa scena, una o due frasi."),
          visual: z
            .string()
            .describe("Indicazione di ripresa per l'agente, es. 'Ingresso: carrellata lenta in avanti'."),
        })
      )
      .describe("Sequenza di scene che copre complessivamente circa 30 secondi."),
    callToAction: z.string().describe("Invito all'azione finale da pronunciare o sovrimprimere."),
  }),
});

export type SocialContent = z.infer<typeof socialContentSchema>;
