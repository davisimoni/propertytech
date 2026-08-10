import { z } from "zod";

export const DOCUMENT_TYPES = [
  "visura_catastale",
  "planimetria",
  "atto_provenienza",
  "ape",
  "altro",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  visura_catastale: "Visura Catastale",
  planimetria: "Planimetria",
  atto_provenienza: "Atto di Provenienza",
  ape: "APE (Attestato di Prestazione Energetica)",
  altro: "Documento non riconosciuto",
};

export const documentExtractionSchema = z.object({
  sintesiAgente: z
    .string()
    .describe(
      "Sintesi in ESATTAMENTE 2 frasi per l'agente immobiliare: la prima riassume proprietari, quote e categoria catastale; la seconda segnala cosa manca o va verificato (dati illeggibili, documenti da richiedere, vincoli). Linguaggio diretto e concreto, senza formule di cortesia."
    ),
  tipoDocumento: z
    .enum(DOCUMENT_TYPES)
    .describe("Il tipo di documento catastale/notarile individuato nel file caricato."),
  datiImmobile: z.object({
    comune: z.string().nullable().describe("Comune in cui è situato l'immobile."),
    foglio: z.string().nullable().describe("Numero di Foglio catastale."),
    particella: z.string().nullable().describe("Numero di Particella o Mappale catastale."),
    subalterno: z.string().nullable().describe("Numero di Subalterno catastale, se presente."),
    categoriaCatastale: z
      .string()
      .nullable()
      .describe("Categoria catastale dell'immobile, es. 'A/3', 'C/6'."),
    renditaCatastale: z
      .string()
      .nullable()
      .describe("Rendita catastale in euro, come riportata nel documento (es. '450,00 €')."),
    indirizzo: z.string().nullable().describe("Indirizzo completo dell'immobile, se presente."),
  }),
  proprietari: z
    .array(
      z.object({
        nomeCognome: z.string().describe("Nome e cognome (o ragione sociale) del proprietario/intestatario."),
        codiceFiscale: z.string().nullable().describe("Codice fiscale o partita IVA del proprietario."),
        quotaProprieta: z
          .string()
          .nullable()
          .describe("Quota di proprietà indicata nel documento, es. '1/2', '100/1000'."),
      })
    )
    .describe("Elenco degli intestatari/proprietari individuati nel documento."),
  noteVincoli: z.object({
    presenti: z
      .boolean()
      .describe("true se nel documento compaiono note, vincoli, ipoteche o annotazioni particolari."),
    dettagli: z
      .string()
      .nullable()
      .describe("Sintesi in italiano delle note o dei vincoli individuati, oppure null se non presenti."),
  }),
});

export type DocumentExtractionResult = z.infer<typeof documentExtractionSchema>;
