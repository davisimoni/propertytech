import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * Estrazione dei dati di un immobile dal testo di un annuncio.
 *
 * Solo testo incollato: il recupero automatico da link è stato rimosso.
 * Immobiliare.it, Idealista e Casa.it sono protetti da sistemi anti-bot che
 * valutano la firma TLS del client, e nessuna delle strade percorse li ha
 * superati dagli IP di Vercel — né una libreria con impronta di browser
 * reale, né un servizio proxy a pagamento, che sul piano in uso rispondeva
 * 403 sul livello anti-Cloudflare.
 *
 * Il percorso testuale non è un ripiego: dà lo stesso risultato, non dipende
 * da servizi esterni né dalla loro disponibilità, e non costa nulla per
 * chiamata. Copre anche le fonti che un recupero da URL non raggiungerebbe
 * mai — una scheda di gestionale, un'email di un collega, un PDF.
 */

const client = new Anthropic();

const IMPORT_MODEL = "claude-opus-5";

export const importedListingSchema = z.object({
  propertyTitle: z
    .string()
    .describe("Titolo sintetico dell'immobile, es. 'Trilocale ristrutturato in Via Roma'."),
  keyPoints: z
    .string()
    .describe(
      "Punti chiave in un unico testo separato da virgole: tipologia, metratura, numero di vani, piano, stato, zona, prezzo, dotazioni. Solo dati presenti nella fonte."
    ),
  zone: z.string().nullable().describe("Zona, quartiere o comune dell'immobile."),
  squareMeters: z.string().nullable().describe("Superficie, es. '80 mq'."),
  price: z.string().nullable().describe("Prezzo richiesto, es. '250.000 €'."),
  rooms: z.string().nullable().describe("Numero di locali o vani, es. '3 locali'."),
  strengths: z
    .array(z.string())
    .describe("Punti di forza rilevati nella fonte, es. 'balcone abitabile', 'ascensore'."),
  missingInfo: z
    .array(z.string())
    .describe(
      "Informazioni utili per un annuncio ma assenti nella fonte, es. 'classe energetica', 'spese condominiali'."
    ),
});

export type ImportedListing = z.infer<typeof importedListingSchema>;

export class ListingImportError extends Error {
  constructor(
    message: string,
    public readonly code: "empty_content" | "upstream_error" | "invalid_response" | "refused"
  ) {
    super(message);
    this.name = "ListingImportError";
  }
}

const SYSTEM_PROMPT = `Sei un assistente per agenzie immobiliari italiane. Ricevi il testo grezzo di un annuncio — copiato da un portale, da un gestionale o da un'email — e ne ricavi i dati strutturati dell'immobile.

Regole:
- Usa ESCLUSIVAMENTE le informazioni presenti nel testo. Non dedurre né stimare metrature, prezzi, numero di locali o classe energetica.
- Se un dato non compare, imponi null (o lascialo fuori da keyPoints): è meglio un campo vuoto di un dato inventato.
- Il testo può contenere elementi di navigazione, cookie banner e annunci di altri immobili: ignora tutto ciò che non riguarda l'immobile principale.
- In "missingInfo" elenca i dati che servirebbero per un buon annuncio ma non ci sono, così l'agente sa cosa integrare a mano.
- "keyPoints" deve essere un elenco discorsivo separato da virgole, pronto da rileggere e correggere.`;

/** Estrae i dati dell'immobile dal testo incollato dall'agente. */
export async function importListing(source: {
  rawText: string;
}): Promise<{ listing: ImportedListing; sourceText: string }> {
  const sourceText = source.rawText.trim();

  if (sourceText.length < 30) {
    throw new ListingImportError(
      "Il testo fornito è troppo breve per ricavarne i dati dell'immobile.",
      "empty_content"
    );
  }

  const response = await client.messages
    .parse({
      model: IMPORT_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "low",
        format: zodOutputFormat(importedListingSchema),
      },
      messages: [
        {
          role: "user",
          content: `Testo dell'annuncio:\n"""\n${sourceText}\n"""\n\nEstrai i dati dell'immobile secondo lo schema.`,
        },
      ],
    })
    .catch((error) => {
      console.error("[listing-import] Anthropic call failed", error);
      throw new ListingImportError("Servizio AI non disponibile.", "upstream_error");
    });

  if (response.stop_reason === "refusal") {
    throw new ListingImportError("Contenuto non elaborabile.", "refused");
  }

  if (!response.parsed_output) {
    throw new ListingImportError("Risposta AI non interpretabile.", "invalid_response");
  }

  return { listing: response.parsed_output, sourceText };
}
