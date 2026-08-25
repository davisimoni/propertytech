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
      | "portal_blocked"
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
 * Messaggio unico per "il portale ci ha riconosciuti e ci ha respinti".
 *
 * Distinto da un errore di rete generico perché la via d'uscita è diversa e
 * concreta: non ha senso invitare a riprovare il link: qualunque numero di
 * tentativi darà lo stesso esito finché la protezione resta attiva. Il codice
 * `portal_blocked` che lo accompagna è ciò che permette alla UI di portare
 * l'agente sul percorso testuale invece di lasciarlo davanti a un errore.
 */
export const PORTAL_BLOCKED_MESSAGE =
  "Il portale protegge l'annuncio da scraping automatico. Passa alla scheda \"Da testo\" e incolla il testo dell'annuncio: l'AI lo analizzerà allo stesso modo.";

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

/** Stati con cui un anti-bot respinge: non è un guasto, è un rifiuto deliberato. */
function isAntiBotStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 405 || status === 429;
}

/**
 * Riconosce la pagina di verifica servita **con stato 200**.
 *
 * Cloudflare e DataDome non rispondono sempre 403: spesso restituiscono 200 con
 * una pagina di challenge. Senza questo controllo quel guscio finirebbe al
 * modello, che ne ricaverebbe un annuncio inventato a partire dal nulla — molto
 * peggio di un errore, perché nessuno andrebbe a verificarlo.
 */
function looksLikeChallengePage(text: string): boolean {
  const haystack = text.slice(0, 4000).toLowerCase();
  return [
    "just a moment",
    "enable javascript and cookies to continue",
    "checking your browser",
    "verifying you are human",
    "attendi qualche istante",
    "cf-browser-verification",
    "px-captcha",
    "captcha-delivery",
  ].some((marker) => haystack.includes(marker));
}

/**
 * Scarica la pagina dell'annuncio e ne estrae il testo.
 *
 * Usa `got-scraping` e non la `fetch` di Node: i portali immobiliari italiani
 * (Immobiliare.it, Idealista, Casa.it) stanno tutti dietro protezioni che
 * valutano la firma TLS del client, non solo lo User-Agent — con `fetch` e un
 * User-Agent da browser rispondevano comunque 403. `got-scraping` presenta un
 * handshake e un set di header coerenti con un Chrome reale, ed è ciò che
 * riporta le tre risposte a 200.
 *
 * Resta comunque un percorso che può fallire — le protezioni cambiano, e non
 * dipendono da noi: quando succede l'errore è `portal_blocked` e la UI dirotta
 * l'agente sul testo incollato, che funziona sempre.
 */
async function fetchListingText(rawUrl: string): Promise<string> {
  const url = assertPublicHttpUrl(rawUrl);

  // Import dinamico: `got-scraping` è ESM pura, e caricarla solo qui evita di
  // pagarne l'avvio nelle richieste che importano da testo incollato.
  const { gotScraping } = await import("got-scraping");

  let statusCode: number;
  let body: string;
  let contentType: string;

  try {
    const response = await gotScraping({
      url: url.toString(),
      /**
       * HTTP/2 disattivato **di proposito**, e non è un dettaglio di comodo.
       *
       * Dentro il runtime di Next la pila HTTP/2 di `got-scraping` fallisce
       * con "socket hang up" su Immobiliare.it — in modo riproducibile, e solo
       * lì: lo stesso identico codice eseguito in Node puro riceve 200. Con
       * `http2: false` la risposta torna 200 con lo stesso corpo. Idealista e
       * Casa.it funzionano in entrambe le modalità, quindi non si perde nulla
       * a disattivarlo per tutti.
       */
      http2: false,
      // Gli stati li interpretiamo noi qui sotto: un 403 va distinto da un
      // guasto di rete, e `got` altrimenti li accomuna in un'unica eccezione.
      throwHttpErrors: false,
      timeout: { request: FETCH_TIMEOUT_MS },
      retry: { limit: 1 },
      headerGeneratorOptions: {
        browsers: [{ name: "chrome", minVersion: 120 }],
        devices: ["desktop"],
        operatingSystems: ["windows"],
        locales: ["it-IT"],
      },
      hooks: {
        /**
         * La guardia SSRF va riapplicata a ogni salto, non solo all'URL
         * digitato: un indirizzo pubblico che redirige su `169.254.169.254`
         * aggirerebbe il controllo iniziale e ci farebbe leggere i metadati
         * dell'istanza. È lo stesso motivo per cui `parsePublicHttpUrl` esiste.
         */
        beforeRedirect: [
          (options) => {
            const next = parsePublicHttpUrl(options.url?.toString() ?? "");
            if (!next.ok) {
              throw new ListingImportError(UNSAFE_URL_MESSAGES[next.reason], "blocked_url");
            }
          },
        ],
      },
    });

    statusCode = response.statusCode;
    body = response.body;
    contentType = String(response.headers["content-type"] ?? "");
  } catch (error) {
    // Un redirect verso la rete interna è già un errore nostro, con il suo
    // messaggio: non va riscritto come guasto di rete.
    if (error instanceof ListingImportError) throw error;

    console.error("[listing-import] Fetch failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    throw new ListingImportError(
      "Non sono riuscito ad aprire il link. Copia e incolla il testo dell'annuncio nel campo qui sotto.",
      "fetch_failed"
    );
  }

  if (isAntiBotStatus(statusCode)) {
    console.error("[listing-import] Portale ha respinto la richiesta", { status: statusCode });
    throw new ListingImportError(PORTAL_BLOCKED_MESSAGE, "portal_blocked");
  }

  if (statusCode >= 400) {
    throw new ListingImportError(
      `Il portale ha rifiutato la richiesta (errore ${statusCode}). Copia e incolla il testo dell'annuncio.`,
      "fetch_failed"
    );
  }

  if (!contentType.includes("html") && !contentType.includes("text")) {
    throw new ListingImportError(
      "Il link non porta a una pagina di testo. Incolla il testo dell'annuncio.",
      "fetch_failed"
    );
  }

  const text = htmlToText(body).slice(0, MAX_FETCHED_CHARS);

  if (looksLikeChallengePage(text)) {
    console.error("[listing-import] Pagina di verifica anti-bot servita con stato", { status: statusCode });
    throw new ListingImportError(PORTAL_BLOCKED_MESSAGE, "portal_blocked");
  }

  if (text.length < 120) {
    throw new ListingImportError(PORTAL_BLOCKED_MESSAGE, "portal_blocked");
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
