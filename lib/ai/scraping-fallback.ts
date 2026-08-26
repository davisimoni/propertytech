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
 * Acceso costa 15-20 secondi per richiesta, perché il servizio carica davvero
 * la pagina in un browser prima di restituirla. Dentro una funzione con
 * `maxDuration = 60` che deve ancora chiamare Claude, quel tempo è la
 * differenza fra un import riuscito e uno troncato.
 *
 * E non serve per leggere il contenuto: nel collaudo diretto con
 * `got-scraping`, che non esegue JavaScript, Immobiliare.it ha restituito
 * 487 KB di HTML con l'annuncio dentro. È servito dal server, non iniettato
 * dal browser.
 *
 * Restava come unica leva anti-blocco dopo il rifiuto di `ultra_premium`
 * (403, "Your current plan does not allow you to use our premium proxies"),
 * ma una leva che fa scadere la richiesta non è una leva. Se i proxy standard
 * con IP italiano non bastassero, si riaccende con `SCRAPER_API_RENDER=true`
 * — e a quel punto il timeout qui sotto va rialzato di conseguenza.
 */
function isRenderEnabled(): boolean {
  return readSecret("SCRAPER_API_RENDER") === "true";
}

/**
 * Attesa massima per il servizio di riserva.
 *
 * ScraperAPI raccomanda **70 secondi** per il miglior tasso di successo, ma
 * non ci stanno: la rotta ha `maxDuration = 60` e dopo il recupero c'è ancora
 * l'estrazione con Claude. Senza rendering la richiesta è un GET attraverso
 * un proxy: si misura in pochi secondi, non in decine. 15 secondi bastano e
 * lasciano al modello i tre quarti del budget della funzione.
 *
 * Attenzione se si riattiva `SCRAPER_API_RENDER`: lì servono 30-40 secondi e
 * questo valore va rialzato, altrimenti si interrompono richieste che stavano
 * per riuscire.
 */
function fallbackTimeoutMs(): number {
  return isRenderEnabled() ? 40_000 : 15_000;
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
async function fetchViaScraperApi(url: string, apiKey: string): Promise<Response> {
  const endpoint = new URL(readSecret("SCRAPER_API_URL") ?? SCRAPERAPI_ENDPOINT);
  endpoint.searchParams.set("api_key", apiKey);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("render", isRenderEnabled() ? "true" : "false");
  endpoint.searchParams.set("country_code", "it");

  // Nessun `ultra_premium`: il piano in uso lo rifiuta con 403 ("Your current
  // plan does not allow you to use our premium proxies"), e inviarlo comunque
  // non degradava su un tentativo normale — faceva fallire l'intera
  // richiesta. Il rendering qui sopra è la sola leva anti-blocco disponibile
  // senza cambiare piano.
  //
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
export async function fetchViaScrapingFallback(url: string): Promise<string | null> {
  const apiKey = readSecret("SCRAPER_API_KEY");
  if (!apiKey) {
    // Detto esplicitamente e non ignorato: prima questo ramo restituiva
    // `null` in silenzio, e nei log restava solo il rifiuto del portale —
    // che faceva sembrare il problema del sito invece che della variabile.
    console.error("[scraping-fallback] SCRAPER_API_KEY assente o non leggibile: nessun tentativo.");
    return null;
  }

  const provider = resolveProvider();

  try {
    const response =
      provider === "firecrawl"
        ? await fetchViaFirecrawl(url, apiKey)
        : await fetchViaScraperApi(url, apiKey);

    if (!response.ok) {
      // Il corpo dell'errore è la parte utile: questi servizi ci scrivono
      // dentro "chiave non valida", "crediti esauriti" o "dominio non
      // supportato", e senza quel dettaglio si resta a indovinare perché il
      // fallback non recupera nulla.
      const detail = await response.text().catch(() => "");
      // Tag `[IMPORT-ERROR]`: una sola stringa da cercare nei log di Vercel
      // per trovare qualunque fallimento dell'import, da qui o dalla rotta.
      console.error("[IMPORT-ERROR]", response.status, detail.slice(0, 500));
      console.error("[scraping-fallback] Servizio di riserva ha rifiutato la richiesta", {
        provider,
        status: response.status,
        // Anche i parametri inviati: è così che si è scoperto che il 403
        // veniva da `ultra_premium` e non dalla chiave.
        render: isRenderEnabled(),
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
    console.error(
      "[IMPORT-ERROR]",
      isTimeout ? "timeout" : "network",
      error instanceof Error ? `${error.name}: ${error.message}` : "unknown"
    );
    console.error("[scraping-fallback] Chiamata al servizio di riserva non riuscita", {
      provider,
      isTimeout,
      timeoutMs: fallbackTimeoutMs(),
    });
    return null;
  }
}
