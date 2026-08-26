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
 * Attesa massima per il servizio di riserva.
 *
 * Generosa di proposito: con il rendering JavaScript attivo il servizio deve
 * caricare la pagina in un browser vero prima di restituirla, e sotto i 30
 * secondi si interromperebbero proprio le pagine più protette — quelle per
 * cui lo si sta pagando. Regge dentro il `maxDuration = 60` della rotta
 * perché sul percorso bloccato il tentativo diretto costa un paio di secondi:
 * un portale che ci respinge risponde 403 subito, non va in timeout.
 */
const FALLBACK_TIMEOUT_MS = 40_000;

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
 * `render=true` fa caricare la pagina in un browser reale lato loro: senza,
 * da Immobiliare.it e Idealista si riceve il guscio dell'applicazione senza
 * il contenuto dell'annuncio, che questi portali iniettano via JavaScript.
 *
 * `country_code=it` instrada la richiesta da un IP italiano. Conta per due
 * motivi: un portale immobiliare italiano guarda con più sospetto il traffico
 * estero, e alcune pagine cambiano contenuto in base alla provenienza.
 */
async function fetchViaScraperApi(url: string, apiKey: string): Promise<Response> {
  const endpoint = new URL(readSecret("SCRAPER_API_URL") ?? SCRAPERAPI_ENDPOINT);
  endpoint.searchParams.set("api_key", apiKey);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("render", "true");
  endpoint.searchParams.set("country_code", "it");

  // GET, senza header di autenticazione: ScraperAPI vuole la chiave nella
  // query string. Un Bearer qui verrebbe semplicemente ignorato.
  return fetch(endpoint.toString(), {
    method: "GET",
    signal: AbortSignal.timeout(FALLBACK_TIMEOUT_MS),
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
    signal: AbortSignal.timeout(FALLBACK_TIMEOUT_MS),
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
  if (!apiKey) return null;

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
