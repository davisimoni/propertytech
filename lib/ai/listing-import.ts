import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { parsePublicHttpUrl, UNSAFE_URL_MESSAGES } from "@/lib/net/safe-url";

const client = new Anthropic();

const IMPORT_MODEL = "claude-opus-5";

/** Tempo massimo di attesa nel recupero di una pagina esterna. */
const FETCH_TIMEOUT_MS = 12_000;

/** Oltre questa soglia la pagina viene troncata: basta ampiamente per un annuncio. */
const MAX_FETCHED_CHARS = 60_000;

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
    public readonly code:
      | "invalid_url"
      | "blocked_url"
      | "fetch_failed"
      | "empty_content"
      | "upstream_error"
      | "invalid_response"
      | "refused"
  ) {
    super(message);
    this.name = "ListingImportError";
  }
}

/**
 * Impedisce che l'URL fornito dall'utente punti alla rete interna.
 *
 * Senza questo controllo l'endpoint diventerebbe un proxy con cui sondare
 * servizi interni non esposti (SSRF): l'utente incolla `http://169.254.169.254`
 * e riceve in risposta i metadati dell'istanza cloud.
 */
function assertPublicHttpUrl(rawUrl: string): URL {
  const result = parsePublicHttpUrl(rawUrl);

  if (!result.ok) {
    throw new ListingImportError(
      UNSAFE_URL_MESSAGES[result.reason],
      result.reason === "invalid_url" ? "invalid_url" : "blocked_url"
    );
  }

  return result.url;
}

/** Rimuove script, stili e marcatori, lasciando il testo leggibile della pagina. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Scarica la pagina dell'annuncio e ne estrae il testo.
 *
 * I portali immobiliari adottano protezioni anti-bot: il recupero può fallire
 * o restituire una pagina di verifica anche con un URL corretto. In quel caso
 * l'errore invita a incollare il testo, che è il percorso sempre funzionante.
 */
async function fetchListingText(rawUrl: string): Promise<string> {
  const url = assertPublicHttpUrl(rawUrl);

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      headers: {
        // Alcuni portali rispondono 403 alle richieste senza user agent.
        "User-Agent": "Mozilla/5.0 (compatible; PropertyTechBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "it-IT,it;q=0.9",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new ListingImportError(
      "Non sono riuscito ad aprire il link. Copia e incolla il testo dell'annuncio nel campo qui sotto.",
      "fetch_failed"
    );
  }

  if (!response.ok) {
    console.error("[listing-import] Fetch returned error", { status: response.status });
    throw new ListingImportError(
      `Il portale ha rifiutato la richiesta (errore ${response.status}). Copia e incolla il testo dell'annuncio.`,
      "fetch_failed"
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("html") && !contentType.includes("text")) {
    throw new ListingImportError(
      "Il link non porta a una pagina di testo. Incolla il testo dell'annuncio.",
      "fetch_failed"
    );
  }

  const text = htmlToText(await response.text()).slice(0, MAX_FETCHED_CHARS);

  if (text.length < 120) {
    throw new ListingImportError(
      "La pagina non contiene testo leggibile: molti portali bloccano l'accesso automatico. Incolla il testo dell'annuncio.",
      "empty_content"
    );
  }

  return text;
}

const SYSTEM_PROMPT = `Sei un assistente per agenzie immobiliari italiane. Ricevi il testo grezzo di un annuncio — copiato da un portale, da un gestionale o estratto da una pagina web — e ne ricavi i dati strutturati dell'immobile.

Regole:
- Usa ESCLUSIVAMENTE le informazioni presenti nel testo. Non dedurre né stimare metrature, prezzi, numero di locali o classe energetica.
- Se un dato non compare, imponi null (o lascialo fuori da keyPoints): è meglio un campo vuoto di un dato inventato.
- Il testo può contenere elementi di navigazione, cookie banner e annunci di altri immobili: ignora tutto ciò che non riguarda l'immobile principale.
- In "missingInfo" elenca i dati che servirebbero per un buon annuncio ma non ci sono, così l'agente sa cosa integrare a mano.
- "keyPoints" deve essere un elenco discorsivo separato da virgole, pronto da rileggere e correggere.`;

/** Estrae i dati dell'immobile da un URL oppure da testo incollato. */
export async function importListing(source: {
  url?: string;
  rawText?: string;
}): Promise<{ listing: ImportedListing; sourceText: string }> {
  const sourceText = source.url ? await fetchListingText(source.url) : (source.rawText ?? "").trim();

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
