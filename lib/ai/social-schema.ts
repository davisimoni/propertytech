import { z } from "zod";

export const TONE_OPTIONS = ["professionale", "emozionale", "lussuoso", "giovane"] as const;

export type ToneOfVoice = (typeof TONE_OPTIONS)[number];

export const TONE_LABELS: Record<ToneOfVoice, string> = {
  professionale: "Professionale",
  emozionale: "Emozionale",
  lussuoso: "Lussuoso",
  giovane: "Giovane / Dinamico",
};

/**
 * Payload accettato da /api/social/generate: due sorgenti alternative.
 *
 * L'agente arriva alla generazione in due modi, che valgono uguale:
 * compilando titolo e punti chiave a mano, oppure incollando il testo di un
 * annuncio. Prima era ammessa solo la prima forma, quindi chi partiva da un
 * testo doveva passare per forza dall'estrazione dei campi — un giro in più
 * che non serve a chi quei campi non intende rileggerli.
 *
 * `superRefine` e non una union: il messaggio deve dire *cosa* manca, mentre
 * una union restituirebbe gli errori di entrambi i rami lasciando l'agente a
 * indovinare quale stesse seguendo.
 */
/**
 * A cosa serve la generazione, quando il punto di partenza e' un testo altrui.
 *
 * Lo stesso annuncio incollato va trattato in tre modi diversi a seconda di
 * cosa se ne vuole fare, e l'agente lo sa mentre incolla: chiederglielo li'
 * costa un clic e cambia il risultato piu' di qualunque aggiustamento del
 * tono.
 */
export const GENERATION_INTENTS = ["social", "fsbo", "rilancio"] as const;

export type GenerationIntent = (typeof GENERATION_INTENTS)[number];

export const INTENT_LABELS: Record<GenerationIntent, string> = {
  social: "Converti in post social (FB/IG)",
  fsbo: "Riscrivi annuncio da privato",
  rilancio: "Riscrivi e rilancia incarico vecchio",
};

export const INTENT_HINTS: Record<GenerationIntent, string> = {
  social: "Sintetizza un annuncio lungo in un post breve, con emoji e invito all'azione.",
  fsbo: "Ripulisce un testo amatoriale (Subito, Marketplace) e lo porta al registro di un portale.",
  rilancio: "Riposiziona un annuncio fermo da tempo, mettendo in evidenza cosa e' cambiato.",
};

export const socialGenerationRequestSchema = z
  .object({
    propertyTitle: z.string().trim().max(150).optional(),
    keyPoints: z.string().trim().max(2000).optional(),
    /** Testo dell'annuncio incollato, alternativa ai due campi sopra. */
    rawText: z.string().trim().max(20_000).optional(),
    tone: z.enum(TONE_OPTIONS),
    /** Cosa farne. Assente vale `social`, che e' il caso di gran lunga piu' frequente. */
    intent: z.enum(GENERATION_INTENTS).optional(),
    /**
     * Istruzione libera dell'agente, per chi sa gia' cosa vuole.
     *
     * Si somma alle altre fonti invece di sostituirle, e non puo' sospendere
     * le regole del prompt di sistema: chiedere "inventa che ha il giardino"
     * non aggiunge un giardino che le note non hanno.
     */
    freePrompt: z.string().trim().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    const hasFields =
      (data.propertyTitle?.length ?? 0) >= 3 && (data.keyPoints?.length ?? 0) >= 10;
    const hasRawText = (data.rawText?.length ?? 0) >= 30;
    const hasPrompt = (data.freePrompt?.length ?? 0) >= 10;

    if (!hasFields && !hasRawText && !hasPrompt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Compila titolo e punti chiave dell'immobile, incolla il testo dell'annuncio, oppure scrivi un'istruzione.",
        path: ["keyPoints"],
      });
    }
  });

export type SocialGenerationRequest = z.infer<typeof socialGenerationRequestSchema>;

export const socialContentSchema = z.object({
  portalListing: z.object({
    title: z.string().describe("Titolo dell'annuncio per il portale, max 80 caratteri, con la zona."),
    body: z
      .string()
      .describe(
        "Testo dell'annuncio per Immobiliare.it/Idealista: 150-250 parole, paragrafi brevi, ottimizzato per la ricerca locale (zona, quartiere, città, tipologia). Usa il gergo tecnico e catastale del settore (esposizione, riscaldamento, classe energetica, stato manutentivo) dove le note lo permettono. Nessun markdown, nessuna emoji."
      ),
    seoKeywords: z
      .array(z.string())
      .describe("5-8 parole chiave di ricerca locale usate nel testo, es. 'trilocale centro Milano'."),
  }),
  socialPost: z.object({
    caption: z
      .string()
      .describe(
        "Caption per Instagram/Facebook, 60-120 parole: frase d'apertura che cattura l'attenzione, poi un breve elenco puntato (3-5 righe) con le caratteristiche chiave, ciascuna con un'emoji contestuale pertinente, poi un paragrafo discorsivo di chiusura con call to action esplicita e immediata."
      ),
    hashtags: z
      .array(z.string())
      .describe(
        "10-15 hashtag senza il simbolo '#', misto fra generici del settore e di zona (es. 'casamilano', 'immobiliaremilano')."
      ),
  }),
  reelScript: z.object({
    hook: z
      .string()
      .describe(
        "Gancio visivo per i primi 3 secondi del video, massimo 8 parole: deve suggerire cosa inquadrare per creare curiosità immediata, non una presentazione generica dell'immobile."
      ),
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
    callToAction: z
      .string()
      .describe(
        "Invito all'azione finale, da pronunciare o sovrimprimere: un'istruzione precisa e immediata (es. \"Scrivici in DM per prenotare la visita\"), mai un generico \"contattaci\"."
      ),
  }),
});

export type SocialContent = z.infer<typeof socialContentSchema>;
