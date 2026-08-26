import "server-only";
import { readSecret } from "@/lib/env";

/**
 * Recupero di riserva per le pagine che le protezioni anti-bot ci negano.
 *
 * Si attiva **solo** quando il tentativo diretto con `got-scraping` è stato
 * respinto (403/429 o pagina di verifica): è un servizio a consumo, e pagarlo
 * per le pagine che sappiamo già di saper leggere sarebbe uno spreco.
 *
 * # Due fornitori, due protocolli incompatibili
 *
 * Non è una preferenza di stile: ScraperAPI e Firecrawl si chiamano in modi
 * che non hanno nulla in comune.
 *
 *   ScraperAPI  GET  ?api_key=…&url=…&render=true   → risponde HTML grezzo
 *   Firecrawl   POST + Bearer + JSON body           → risponde JSON
 *
 * Mandare la richiesta nella forma sbagliata non degrada: fallisce e basta,
 * con un 401 che sembra una chiave errata. Per questo il fornitore va scelto
 * esplicitamente e non indovinato dalla chiave.
 *
 * # Perché non un browser headless
 *
 * Puppeteer o Playwright su Vercel richiedono un binario di Chromium di
 * svariate decine di MB contro il tetto della funzione serverless, con avvii
 * a freddo di secondi su una rotta che già somma il recupero della pagina e
 * una chiamata a Claude. Ma il problema vero è un altro: **Chrome headless è
 * a sua volta riconoscibile**, e lo si pagherebbe senza garanzia di superare
 * il blocco. Quello che serve davvero — proxy residenziali a rotazione e
 * rendering JS lato loro — è esattamente ciò che questi servizi vendono.
 */

export type ScraperProviderId = "scraperapi" | "firecrawl";

const SCRAPERAPI_ENDPOINT = "https://api.scraperapi.com/";
const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v1/scrape";

/**
 * Rendering JavaScript lato servizio: **spento** per impostazione predefinita.
 *
 * Costava troppo su due fronti. In tempo: il servizio deve caricare la pagina
 * in un browser vero, e su Vercel l'attesa faceva scattare il timeout della
 * funzione prima ancora di arrivare alla chiamata a Claude. In denaro: una
 * richiesta con rendering consuma diverse volte i crediti di una semplice.
 *
 * E soprattutto non risultava necessario: nel collaudo diretto con
 * `got-scraping` — che non esegue JavaScript — Immobiliare.it ha restituito
 * 487 KB di HTML con l'annuncio dentro. Il contenuto è servito dal server,
 * non iniettato dal browser, quindi l'HTML statico basta.
 *
 * Resta attivabile con `SCRAPER_API_RENDER=true` per i portali che
 * dovessero comportarsi diversamente: si prova senza toccare il codice.
 */
function isRenderEnabled(): boolean {
  return readSecret("SCRAPER_API_RENDER") === "true";
}

/**
 * Attesa massima per il servizio di riserva.
 *
 * ScraperAPI raccomanda **70 secondi** per il miglior tasso di successo, ma
 * non ci stanno: la rotta ha `maxDuration = 60` e dopo il recupero c'è ancora
 * l'estrazione con Claude. 35 secondi è il massimo che lascia un margine
 * onesto al modello, e i 20 precedenti erano semplicemente troppo pochi —
 * interrompevamo noi la chiamata prima che il servizio finisse, ed è da lì
 * che nascevano i TimeoutError nei log.
 *
 * Il vero rimedio al tempo non è comunque attendere di più ma farsi bloccare
 * di meno: vedi `hardened` in `ScrapingFallbackOptions`.
 */
function fallbackTimeoutMs(): number {
  return 35_000;
}

export interface ScrapingFallbackOptions {
  /**
   * Modalità rinforzata per i portali che sappiamo respingerci.
   *
   * Attiva `ultra_premium`, il livello anti-bot di ScraperAPI pensato per
   * Cloudflare e simili. Non è il default perché **costa molti più crediti**
   * per richiesta: sui domini che ci lasciano passare sarebbe denaro buttato.
   * Sui tre portali italiani, invece, la richiesta economica è destinata a
   * fallire comunque — lì il tentativo a basso costo non è un risparmio, è
   * solo un timeout pagato due volte.
   *
   * Nota: il parametro che ScrapFly chiama `asp` qui **non esiste**;
   * `ultra_premium` è il suo equivalente nel dialetto ScraperAPI.
   */
  hardened?: boolean;
}

export function isScrapingFallbackConfigured(): boolean {
  return Boolean(readSecret("SCRAPER_API_KEY"));
}

/**
 * Fornitore configurato.
 *
 * Il default è ScraperAPI. `SCRAPER_API_PROVIDER` lo forza esplicitamente;
 * in mancanza si guarda l'endpoint, perché chi punta a Firecrawl a mano non
 * deve anche ricordarsi una seconda variabile.
 */
function resolveProvider(): ScraperProviderId {
  const explicit = readSecret("SCRAPER_API_PROVIDER")?.toLowerCase();
  if (explicit === "firecrawl" || explicit === "scraperapi") return explicit;

  return readSecret("SCRAPER_API_URL")?.includes("firecrawl") ? "firecrawl" : "scraperapi";
}

/** Estrae il primo campo testuale utile dalla risposta JSON di Firecrawl. */
function readFirecrawlContent(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;

  const record = payload as Record<string, unknown>;
  const data = (record.data ?? record) as Record<string, unknown>;

  // `markdown` prima di `html`: arriva già ripulito da menu e banner, che è
  // esattamente il lavoro che `htmlToText` farebbe peggio.
  for (const key of ["markdown", "content", "text", "html"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }

  return null;
}

/**
 * Richiesta a ScraperAPI.
 *
 * `country_code=it` instrada la richiesta da un IP italiano, e resta anche
 * senza rendering: è la parte che conta davvero contro questi blocchi. Un
 * portale immobiliare italiano guarda con più sospetto il traffico estero, e
 * alcune pagine cambiano contenuto in base alla provenienza.
 *
 * `render` è spento salvo richiesta esplicita — vedi `isRenderEnabled`.
 */
async function fetchViaScraperApi(
  url: string,
  apiKey: string,
  options: ScrapingFallbackOptions
): Promise<Response> {
  const endpoint = new URL(readSecret("SCRAPER_API_URL") ?? SCRAPERAPI_ENDPOINT);
  endpoint.searchParams.set("api_key", apiKey);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("render", isRenderEnabled() ? "true" : "false");
  endpoint.searchParams.set("country_code", "it");

  // `ultra_premium` forzabile anche da variabile, per poterlo provare su un
  // dominio non in elenco senza rimettere mano al codice.
  if (options.hardened || readSecret("SCRAPER_API_ULTRA_PREMIUM") === "true") {
    endpoint.searchParams.set("ultra_premium", "true");
  }

  // Nessun `keep_headers` e nessun User-Agent nostro, **di proposito**: quel
  // parametro dice a ScraperAPI di inoltrare i nostri header al posto dei
  // suoi. Ma gli header che genera loro sono la parte che fa passare la
  // richiesta — sono accordati con l'impronta TLS del proxy che la spedisce.
  // Sostituirli con una stringa Chrome scritta da noi crea un'incoerenza fra
  // header e handshake, cioè esattamente il segnale che Cloudflare cerca.
  //
  // GET senza header di autenticazione: la chiave sta nella query string, e
  // un Bearer qui verrebbe semplicemente ignorato.
  return fetch(endpoint.toString(), {
    method: "GET",
    signal: AbortSignal.timeout(fallbackTimeoutMs()),
  });
}

/** Richiesta a Firecrawl: POST autenticato con Bearer, risposta JSON. */
async function fetchViaFirecrawl(url: string, apiKey: string): Promise<Response> {
  const endpoint = readSecret("SCRAPER_API_URL") ?? FIRECRAWL_ENDPOINT;

  return fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, formats: ["markdown"] }),
    signal: AbortSignal.timeout(fallbackTimeoutMs()),
  });
}

/**
 * Recupera la pagina tramite il servizio di riserva.
 *
 * `null` quando non è configurato o non ce l'ha fatta: il chiamante tratta i
 * due casi allo stesso modo — si rinuncia al link e si invita a incollare il
 * testo — perché all'agente la differenza non cambia cosa deve fare.
 */
export async function fetchViaScrapingFallback(
  url: string,
  options: ScrapingFallbackOptions = {}
): Promise<string | null> {
  const apiKey = readSecret("SCRAPER_API_KEY");
  if (!apiKey) return null;

  const provider = resolveProvider();

  try {
    const response =
      provider === "firecrawl"
        ? await fetchViaFirecrawl(url, apiKey)
        : await fetchViaScraperApi(url, apiKey, options);

    if (!response.ok) {
      // Il corpo dell'errore è la parte utile: questi servizi ci scrivono
      // dentro "chiave non valida", "crediti esauriti" o "dominio non
      // supportato", e senza quel dettaglio si resta a indovinare perché il
      // fallback non recupera nulla.
      const detail = await response.text().catch(() => "");
      console.error("[scraping-fallback] Servizio di riserva ha rifiutato la richiesta", {
        provider,
        status: response.status,
        detail: detail.slice(0, 300),
      });
      return null;
    }

    // ScraperAPI risponde con l'HTML della pagina, non con un involucro JSON.
    const content =
      provider === "firecrawl"
        ? readFirecrawlContent(await response.json().catch(() => null))
        : await response.text();

    if (!content || content.trim().length === 0) {
      console.error("[scraping-fallback] Risposta senza contenuto utilizzabile", { provider });
      return null;
    }

    return content;
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
    console.error("[scraping-fallback] Chiamata al servizio di riserva non riuscita", {
      provider,
      isTimeout,
      name: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}
