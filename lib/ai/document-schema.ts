import { z } from "zod";

/**
 * Estrazione documentale del Modulo 2.
 *
 * Lo schema riflette una distinzione che nel mestiere è fondamentale e che un
 * estrattore generico appiattisce: **catasto, situazione giuridica e
 * urbanistica sono tre piani diversi**. Il catasto identifica e censisce; la
 * Conservatoria pubblicizza la situazione giuridica (ipoteche, pignoramenti,
 * trascrizioni); l'urbanistica dice se lo stato dei luoghi è coerente con i
 * titoli edilizi. Un immobile può essere catastalmente in ordine e
 * urbanisticamente no — o viceversa — e confonderli è l'errore che fa
 * perdere credibilità davanti a un'agenzia.
 *
 * Le sezioni oltre al catasto sono popolate solo quando il documento le
 * contiene: da una visura non arriveranno titoli edilizi, da una CILA non
 * arriveranno intestatari.
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
 * Non è un dettaglio formale: risponde alla domanda operativa "chi può
 * vendere". Un nudo proprietario non dispone del pieno godimento finché
 * esiste l'usufrutto, e un'agenzia che se ne accorge al preliminare ha già
 * perso settimane.
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

/** Gravità di una criticità rilevata, per ordinare e colorare senza allarmare. */
export const CRITICITA_LIVELLI = ["alta", "media", "informativa"] as const;

export type CriticitaLivello = (typeof CRITICITA_LIVELLI)[number];

export const documentExtractionSchema = z.object({
  sintesiAgente: z
    .string()
    .describe(
      "Sintesi in ESATTAMENTE 2 frasi per l'agente immobiliare: la prima riassume proprietari, quote e categoria catastale; la seconda segnala cosa manca o va verificato (dati illeggibili, documenti da richiedere, vincoli). Linguaggio diretto e concreto, senza formule di cortesia."
    ),
  tipoDocumento: z
    .enum(DOCUMENT_TYPES)
    .describe("Il tipo di documento individuato nel file caricato."),
  datiImmobile: z.object({
    comune: z.string().nullable().describe("Comune catastale in cui l'immobile è censito."),
    foglio: z.string().nullable().describe("Numero di Foglio catastale."),
    particella: z.string().nullable().describe("Numero di Particella o Mappale catastale."),
    subalterno: z.string().nullable().describe("Numero di Subalterno catastale, se presente."),
    categoriaCatastale: z
      .string()
      .nullable()
      .describe("Categoria catastale dell'immobile, es. 'A/3', 'C/6'."),
    classeCatastale: z
      .string()
      .nullable()
      .describe(
        "Classe catastale, es. '3'. È un parametro reddituale interno alla categoria, NON un giudizio di qualità dell'immobile."
      ),
    consistenza: z
      .string()
      .nullable()
      .describe(
        "Consistenza catastale come riportata, es. '6,5 vani' o '85 mq'. Per le abitazioni è espressa in vani e NON coincide con il numero di stanze fisiche."
      ),
    renditaCatastale: z
      .string()
      .nullable()
      .describe("Rendita catastale in euro, come riportata nel documento (es. '450,00 €')."),
    superficieCatastale: z
      .string()
      .nullable()
      .describe(
        "Superficie catastale in metri quadri, se riportata. Va tenuta distinta dalla superficie commerciale usata nelle compravendite, che si calcola con criteri diversi."
      ),
    indirizzo: z.string().nullable().describe("Indirizzo completo dell'immobile, se presente."),
  }),
  proprietari: z
    .array(
      z.object({
        nomeCognome: z.string().describe("Nome e cognome (o ragione sociale) dell'intestatario."),
        codiceFiscale: z.string().nullable().describe("Codice fiscale o partita IVA."),
        quotaProprieta: z
          .string()
          .nullable()
          .describe("Quota indicata nel documento, es. '1/2', '1000/1000'."),
        dirittoReale: z
          .enum(DIRITTI_REALI)
          .describe(
            "Diritto reale vantato dal soggetto. Usa 'non_specificato' se il documento non lo indica: non dedurlo."
          ),
      })
    )
    .describe("Intestatari individuati nel documento, con quota e diritto reale."),
  pertinenze: z
    .array(
      z.object({
        subalterno: z.string().nullable().describe("Subalterno della pertinenza, se indicato."),
        categoriaCatastale: z
          .string()
          .nullable()
          .describe("Categoria della pertinenza, es. 'C/6' per un garage, 'C/2' per una cantina."),
        descrizione: z.string().describe("Cosa è, in parole semplici: garage, cantina, posto auto."),
      })
    )
    .describe(
      "Unità accessorie censite sulla stessa particella (garage, cantina, posto auto). Array vuoto se il documento non ne riporta: sono spesso subalterni distinti dello stesso fabbricato."
    )
    // `.default([])` su tutte le sezioni introdotte dopo il primo rilascio:
    // un APE o una planimetria non contengono pertinenze, formalità o
    // delibere, e pretenderle renderebbe l'estrazione fragile proprio sui
    // documenti più semplici. Il modello continua a riceverne la descrizione
    // e a compilarle quando ci sono.
    .default([]),
  situazioneGiuridica: z
    .object({
      attoProvenienza: z
        .string()
        .nullable()
        .describe(
          "Titolo con cui è stato acquistato il bene: compravendita, donazione, successione, divisione. Con data e notaio se presenti."
        ),
      formalita: z
        .array(
          z.object({
            tipo: z
              .string()
              .describe("Tipo di formalità: ipoteca, pignoramento, trascrizione, domanda giudiziale, cancellazione."),
            dettaglio: z
              .string()
              .describe("Soggetti coinvolti, importo, data e registro, per quanto leggibile."),
          })
        )
        .describe(
          "Formalità dei registri immobiliari presenti nel documento. Array vuoto se assenti o se il documento non è un'ispezione ipotecaria."
        )
        .default([]),
    })
    .default({ attoProvenienza: null, formalita: [] })
    .describe("Piano giuridico: provenienza e formalità pubblicizzate. Distinto dal catasto."),
  titoliEdilizi: z
    .array(
      z.object({
        tipo: z
          .string()
          .describe("CILA, SCIA, Permesso di Costruire, DIA, sanatoria, condono, agibilità."),
        estremi: z
          .string()
          .nullable()
          .describe("Numero di protocollo, data di rilascio o presentazione, se presenti."),
      })
    )
    .describe(
      "Titoli edilizi citati nel documento. Array vuoto se assenti. Riguardano la conformità urbanistica, che è cosa diversa dalla conformità catastale."
    )
    .default([]),
  condominio: z
    .object({
      millesimi: z
        .string()
        .nullable()
        .describe("Quota millesimale, es. '42,15'. È una frazione su 1000, non una percentuale sull'edificio."),
      lavoriDeliberati: z
        .array(
          z.object({
            descrizione: z.string().describe("Lavoro o intervento deliberato dall'assemblea."),
            importo: z.string().nullable().describe("Importo complessivo o quota a carico, se indicato."),
            stato: z
              .string()
              .nullable()
              .describe("Deliberato, in corso, concluso, oppure la dicitura usata nel verbale."),
          })
        )
        .describe(
          "Lavori e spese straordinarie deliberate. Array vuoto se il documento non è un verbale o non ne contiene. È l'informazione che un acquirente deve conoscere prima della proposta."
        )
        .default([]),
    })
    .default({ millesimi: null, lavoriDeliberati: [] })
    .describe("Dati condominiali, popolati dai verbali assembleari e dai riparti."),
  criticita: z
    .array(
      z.object({
        livello: z
          .enum(CRITICITA_LIVELLI)
          .describe(
            "'alta' per pignoramenti, ipoteche attive, assenza di agibilità; 'media' per sanatorie, condoni, incongruenze fra dati; 'informativa' per tutto ciò che merita solo una verifica."
          ),
        titolo: z.string().describe("La criticità in poche parole, es. 'Ipoteca volontaria presente'."),
        dettaglio: z
          .string()
          .describe(
            "Cosa hai rilevato e su quale base, citando i valori del documento. Se è un'incongruenza fra due dati, riporta entrambi."
          ),
      })
    )
    .describe(
      "Elementi che meritano attenzione dell'agente. Segnala in particolare: incongruenze fra superficie catastale e commerciale, disallineamenti fra intestatari catastali e soggetti dell'atto, presenza di ipoteche, pignoramenti, sanatorie o condoni, assenza di agibilità, diritti reali che limitano la vendita. NON esprimere giudizi legali né conclusioni sulla vendibilità: descrivi il fatto e lascia la valutazione all'agente. Array vuoto se non emerge nulla."
    )
    .default([]),
  noteVincoli: z.object({
    presenti: z
      .boolean()
      .describe("true se nel documento compaiono note, vincoli o annotazioni particolari."),
    dettagli: z
      .string()
      .nullable()
      .describe("Sintesi in italiano delle note individuate, oppure null se non presenti."),
  }),
});

export type DocumentExtractionResult = z.infer<typeof documentExtractionSchema>;
