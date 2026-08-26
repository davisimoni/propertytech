import { z } from "zod";

/**
 * Estrazione documentale del Modulo 2.
 *
 * Lo schema riflette una distinzione fondamentale nel mestiere: **catasto,
 * situazione giuridica e urbanistica sono tre piani diversi**. Il catasto
 * identifica e censisce; la Conservatoria pubblicizza la situazione giuridica
 * (ipoteche, pignoramenti, trascrizioni); l'urbanistica dice se lo stato dei
 * luoghi è coerente con i titoli edilizi. Un immobile può essere in regola su
 * un piano e non sull'altro.
 *
 * # Due vincoli degli structured outputs che dettano la forma di questo file
 *
 * Lo schema viene compilato in una grammatica, e superate certe soglie l'API
 * rifiuta l'intera richiesta con un 400: non degrada e non tronca —
 * l'estrazione smette del tutto di funzionare. Due limiti, entrambi misurati
 * sul campo contro l'API reale:
 *
 * 1. **Campi union**: ogni `.nullable()` è un tipo union. 16 passano, 17 no.
 *    `null` resta quindi solo dove la distinzione "assente" vs "vuoto" pesa
 *    davvero — dati catastali e quote. Altrove si usa la stringa vuota, che
 *    in interfaccia si comporta uguale perché quei punti sono già controlli
 *    di verità.
 * 2. **Dimensione complessiva**: ci rientrano anche i testi di `.describe()`.
 *    Per questo qui le descrizioni sono telegrafiche: le regole di dominio —
 *    i tre piani, le precisazioni terminologiche, cosa segnalare come
 *    criticità — stanno in `EXTRACTION_PROMPT`, che non pesa sulla
 *    grammatica. Allungare una descrizione qui può far fallire l'intero
 *    modulo; spiegare la stessa cosa nel prompt no.
 */

export const DOCUMENT_TYPES = [
  "visura_catastale",
  "planimetria",
  "atto_provenienza",
  "ape",
  "ispezione_ipotecaria",
  "titolo_edilizio",
  "verbale_condominio",
  "altro",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  visura_catastale: "Visura Catastale",
  planimetria: "Planimetria",
  atto_provenienza: "Atto di Provenienza",
  ape: "APE (Attestato di Prestazione Energetica)",
  ispezione_ipotecaria: "Ispezione Ipotecaria / Conservatoria",
  titolo_edilizio: "Titolo Edilizio (CILA, SCIA, Permesso di Costruire)",
  verbale_condominio: "Verbale Assembleare / Documento Condominiale",
  altro: "Documento non riconosciuto",
};

/**
 * Diritto reale dell'intestatario.
 *
 * Risponde alla domanda operativa "chi può vendere": un nudo proprietario non
 * dispone del pieno godimento finché esiste l'usufrutto, e un'agenzia che se
 * ne accorge al preliminare ha già perso settimane.
 */
export const DIRITTI_REALI = [
  "proprieta",
  "nuda_proprieta",
  "usufrutto",
  "abitazione",
  "uso",
  "superficie",
  "non_specificato",
] as const;

export type DirittoReale = (typeof DIRITTI_REALI)[number];

export const DIRITTO_REALE_LABELS: Record<DirittoReale, string> = {
  proprieta: "Proprietà",
  nuda_proprieta: "Nuda proprietà",
  usufrutto: "Usufrutto",
  abitazione: "Diritto di abitazione",
  uso: "Diritto d'uso",
  superficie: "Diritto di superficie",
  non_specificato: "Non specificato",
};

/** Gravità di una criticità, per ordinare e colorare senza allarmare. */
export const CRITICITA_LIVELLI = ["alta", "media", "informativa"] as const;

export type CriticitaLivello = (typeof CRITICITA_LIVELLI)[number];

/**
 * Ambito di una voce non catastale.
 *
 * Un solo array tipizzato al posto di tre sezioni annidate: la grammatica
 * degli structured outputs non reggeva quattro strutture separate, e questa
 * forma conserva la stessa informazione con una frazione del peso. La UI
 * raggruppa per ambito e ottiene le stesse sezioni di prima.
 */
export const AMBITI_DOCUMENTO = [
  "provenienza",
  "formalita",
  "titolo_edilizio",
  "condominio",
] as const;

export type AmbitoDocumento = (typeof AMBITI_DOCUMENTO)[number];

export const AMBITO_LABELS: Record<AmbitoDocumento, string> = {
  provenienza: "Provenienza",
  formalita: "Formalità e gravami",
  titolo_edilizio: "Titoli edilizi",
  condominio: "Condominio",
};

export const documentExtractionSchema = z.object({
  sintesiAgente: z
    .string()
    .describe("Due frasi: la prima riassume proprietari, quote e categoria; la seconda cosa manca o va verificato."),
  tipoDocumento: z.enum(DOCUMENT_TYPES).describe("Tipo di documento individuato."),
  datiImmobile: z.object({
    comune: z.string().nullable().describe("Comune catastale."),
    foglio: z.string().nullable().describe("Foglio catastale."),
    particella: z.string().nullable().describe("Particella o mappale."),
    subalterno: z.string().nullable().describe("Subalterno."),
    categoriaCatastale: z.string().nullable().describe("Categoria, es. 'A/3', 'C/6'."),
    classeCatastale: z.string().nullable().describe("Classe catastale."),
    consistenza: z.string().nullable().describe("Consistenza, es. '6,5 vani'."),
    renditaCatastale: z.string().nullable().describe("Rendita in euro."),
    superficieCatastale: z.string().nullable().describe("Superficie catastale in mq."),
    indirizzo: z.string().nullable().describe("Indirizzo completo."),
  }),
  proprietari: z
    .array(
      z.object({
        nomeCognome: z.string().describe("Nome e cognome o ragione sociale."),
        codiceFiscale: z.string().nullable().describe("Codice fiscale o partita IVA."),
        quotaProprieta: z.string().nullable().describe("Quota, es. '1/2'."),
        dirittoReale: z.enum(DIRITTI_REALI).describe("Diritto vantato; non dedurlo se assente."),
      })
    )
    .describe("Intestatari con quota e diritto reale."),
  pertinenze: z
    .array(
      z.object({
        subalterno: z.string().describe("Subalterno; vuoto se assente."),
        categoriaCatastale: z.string().describe("Categoria, es. 'C/6'; vuoto se assente."),
        descrizione: z.string().describe("Garage, cantina, posto auto."),
      })
    )
    .describe("Unità accessorie sulla stessa particella. Vuoto se assenti."),
  altriDati: z
    .array(
      z.object({
        ambito: z.enum(AMBITI_DOCUMENTO).describe("A quale piano appartiene la voce."),
        voce: z.string().describe("Titolo breve, es. 'Ipoteca volontaria', 'CILA', 'Rifacimento facciata'."),
        dettaglio: z.string().describe("Soggetti, importi, date, estremi, per quanto leggibili."),
      })
    )
    .describe("Provenienza, formalità dei registri, titoli edilizi, millesimi e lavori deliberati. Vuoto se assenti."),
  criticita: z
    .array(
      z.object({
        livello: z.enum(CRITICITA_LIVELLI).describe("Gravità del rilievo."),
        titolo: z.string().describe("La criticità in poche parole."),
        dettaglio: z.string().describe("Cosa hai rilevato, citando i valori del documento."),
      })
    )
    .describe("Elementi da verificare. Vuoto se non emerge nulla."),
  noteVincoli: z.object({
    presenti: z.boolean().describe("true se ci sono note o annotazioni particolari."),
    dettagli: z.string().describe("Sintesi delle note; vuoto se assenti."),
  }),
});

export type DocumentExtractionResult = z.infer<typeof documentExtractionSchema>;
