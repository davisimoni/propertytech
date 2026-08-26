import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { parsePublicHttpUrl, UNSAFE_URL_MESSAGES } from "@/lib/net/safe-url";
import { fetchViaScrapingFallback, isScrapingFallbackConfigured } from "./scraping-fallback";

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

  // Sui portali che sappiamo bloccarci dagli IP di Vercel si va dritti al
  // proxy: il tentativo diretto è già stato pagato in produzione — fallisce
  // sempre, e prima di fallire consuma secondi preziosi dentro il
  // `maxDuration` della rotta. Provarlo di nuovo a ogni import sarebbe
  // ripetere un esperimento di cui conosciamo il risultato.
  if (shouldUseProxyFirst(url)) {
    const hasKey = isScrapingFallbackConfigured();

    // Riga diagnostica esplicita: dice quale strada si sta prendendo e se la
    // chiave risulta leggibile — mai il suo valore. È la prima cosa da
    // guardare nei log quando l'import non riesce, e la sua assenza è ciò
    // che ha reso opaca l'intera vicenda finora.
    console.info("[listing-import] Portale con blocco noto: si va direttamente al proxy", {
      host: url.hostname,
      scraperApiKeyConfigured: hasKey,
    });

    if (!hasKey) {
      console.error(
        "[listing-import] SCRAPER_API_KEY assente o non leggibile: impossibile recuperare questo portale. " +
          "Verifica la variabile sull'ambiente Production di Vercel e ridistribuisci."
      );
      throw new ListingImportError(PORTAL_BLOCKED_MESSAGE, "portal_blocked");
    }

    const viaProxy = await tryScrapingFallback(url);
    if (viaProxy) return viaProxy;

    // Niente ripiego sul tentativo diretto, e non è una dimenticanza: il
    // proxy può aver già consumato 35 secondi dei 60 della funzione, e
    // aggiungerne fino a 24 di richiesta diretta manderebbe la rotta in
    // timeout — l'agente vedrebbe un errore di piattaforma invece
    // dell'avviso che lo manda sulla scheda "Da testo". Per di più su questi
    // portali la via diretta è proprio quella che sappiamo fallire.
    throw new ListingImportError(PORTAL_BLOCKED_MESSAGE, "portal_blocked");
  }

  const direct = await tryDirectFetch(url);
  if (direct) return direct;

  // **Qualunque** sia stato il motivo del fallimento diretto — 403, errore di
  // connessione, contenuto illeggibile — si prova il proxy prima di
  // rinunciare. Prima il percorso d'eccezione lanciava `fetch_failed` senza
  // nemmeno interpellarlo: bastava che `got-scraping` sollevasse un errore di
  // rete invece di restituire un 403 pulito perché la riserva non entrasse
  // mai in funzione.
  const viaProxy = await tryScrapingFallback(url);
  if (viaProxy) return viaProxy;

  throw new ListingImportError(PORTAL_BLOCKED_MESSAGE, "portal_blocked");
}

/**
 * Portali che dagli IP di Vercel rispondono sempre con un blocco.
 *
 * Elenco deliberatamente corto e specifico: vale solo per i portali su cui
 * abbiamo osservato il blocco, non per "tutti i siti immobiliari". Per
 * qualunque altro dominio si prova prima la via diretta, che è gratuita.
 */
const PORTALS_REQUIRING_PROXY = ["immobiliare.it", "idealista.it", "casa.it"];

/**
 * Decisione basata **solo sul dominio**, mai sulla presenza della chiave.
 *
 * Legarla anche alla configurazione è stato l'errore che ha tenuto in piedi
 * il problema: con `SCRAPER_API_KEY` non leggibile la funzione rispondeva
 * `false`, la rotta ripiegava sulla richiesta diretta — quella che questi
 * portali rifiutano sempre — e il fallback veniva poi saltato dallo stesso
 * controllo. Nei log restava solo "il portale ha rifiutato la richiesta
 * diretta", che fa sembrare il problema del portale mentre è di
 * configurazione. Adesso il percorso è deciso dal dominio e una chiave
 * mancante viene detta a voce alta, invece di degradare in silenzio.
 */
function shouldUseProxyFirst(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  // Confronto sul suffisso di dominio, non `includes`: `immobiliare.it.evil.test`
  // non deve contare come Immobiliare.it.
  return PORTALS_REQUIRING_PROXY.some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );
}

/**
 * Tentativo diretto con `got-scraping`.
 *
 * Restituisce `null` invece di lanciare per ogni fallimento recuperabile —
 * blocco, errore di rete, pagina illeggibile — perché la decisione se
 * rinunciare spetta al chiamante, che ha ancora una carta da giocare. Continua
 * invece a lanciare per gli URL verso la rete interna: quello non è un
 * fallimento da recuperare con un altro strumento, è una richiesta da rifiutare.
 */
async function tryDirectFetch(url: URL): Promise<string | null> {
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
    // Un URL verso la rete interna non è un fallimento da recuperare con un
    // altro strumento: si rifiuta e basta, senza passare dal proxy.
    if (error instanceof ListingImportError) throw error;

    console.error("[listing-import] Tentativo diretto fallito", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }

  if (isAntiBotStatus(statusCode) || statusCode >= 400) {
    console.error("[listing-import] Il portale ha rifiutato la richiesta diretta", {
      status: statusCode,
    });
    return null;
  }

  if (!contentType.includes("html") && !contentType.includes("text")) {
    console.error("[listing-import] Il link diretto non porta a una pagina di testo", { contentType });
    return null;
  }

  return usableText(htmlToText(body));
}

/**
 * Testo utilizzabile, oppure `null`.
 *
 * Applicato a entrambe le sorgenti: anche il proxy può restituire il guscio di
 * una pagina di verifica, e darlo in pasto al modello significherebbe farsi
 * inventare un annuncio a partire dal nulla — molto peggio di un errore,
 * perché nessuno andrebbe a controllarlo.
 */
function usableText(raw: string): string | null {
  const text = raw.slice(0, MAX_FETCHED_CHARS);

  if (looksLikeChallengePage(text)) {
    console.error("[listing-import] Ricevuta una pagina di verifica anti-bot");
    return null;
  }

  return text.length >= 120 ? text : null;
}

/**
 * Tentativo tramite il servizio proxy.
 *
 * `null` sia quando non è configurato sia quando non ce l'ha fatta: al
 * chiamante la differenza non cambia la mossa successiva. Il motivo preciso
 * resta nei log di `scraping-fallback`, che è dove serve per diagnosticare.
 */
async function tryScrapingFallback(url: URL): Promise<string | null> {
  if (!isScrapingFallbackConfigured()) return null;

  const recovered = await fetchViaScrapingFallback(url.toString());
  if (!recovered) return null;

  const text = usableText(htmlToText(recovered));

  if (text) {
    console.info("[listing-import] Pagina recuperata tramite proxy");
  } else {
    console.error("[listing-import] Il proxy ha restituito contenuto inutilizzabile");
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
