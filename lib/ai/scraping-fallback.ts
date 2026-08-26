import "server-only";
import { readSecret } from "@/lib/env";

/**
 * Recupero di riserva per le pagine che le protezioni anti-bot ci negano.
 *
 * Si attiva **solo** quando il tentativo diretto con `got-scraping` è stato
 * respinto (403/429 o pagina di verifica): è un servizio a consumo, e pagarlo
 * per le pagine che sappiamo già di saper leggere sarebbe uno spreco.
 *
 * # Perché un'API e non un browser headless
 *
 * Puppeteer o Playwright su Vercel richiedono un binario di Chromium
 * (`@sparticuz/chromium`) di svariate decine di MB contro il tetto della
 * funzione serverless, con avvii a freddo di secondi su una rotta che già
 * somma il recupero della pagina e una chiamata a Claude. Ma il problema vero
 * è un altro: **Chrome headless è a sua volta riconoscibile**. Cloudflare e
 * DataDome ne rilevano da anni le impronte, quindi si pagherebbe tutto quel
 * peso senza la certezza di superare il blocco. Un servizio specializzato
 * usa proxy residenziali a rotazione — la parte che non possiamo replicare —
 * e da qui costa una chiamata HTTP e zero dipendenze.
 *
 * # Agnostico rispetto al fornitore
 *
 * Stesso principio del seam STT in `lib/ai/transcription.ts`: l'endpoint è
 * configurabile, così cambiare fornitore non richiede di toccare il codice.
 * Il valore predefinito parla il dialetto di Firecrawl, il più diffuso per
 * questo compito.
 *
 * ATTENZIONE — il contratto di risposta **non è stato verificato** contro il
 * servizio reale (serve una chiave a pagamento). La lettura è quindi
 * volutamente permissiva: si accettano più forme di risposta e, se nessuna
 * contiene testo utile, si restituisce `null` e il flusso prosegue verso il
 * percorso testuale. Stesso criterio dei connettori gestionale marcati
 * `verified: false` in `lib/integrations/providers.ts`: meglio dichiarare
 * l'incertezza che dare per buono un endpoint mai visto rispondere.
 */

const DEFAULT_ENDPOINT = "https://api.firecrawl.dev/v1/scrape";
const FALLBACK_TIMEOUT_MS = 25_000;

export function isScrapingFallbackConfigured(): boolean {
  return Boolean(readSecret("SCRAPER_API_KEY"));
}

/** Estrae il primo campo testuale utile, senza pretendere di conoscere la forma esatta. */
function readContent(payload: unknown): string | null {
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
 * Recupera la pagina tramite il servizio di riserva.
 *
 * `null` quando non è configurato o non ce l'ha fatta: il chiamante tratta i
 * due casi allo stesso modo — si rinuncia al link e si invita a incollare il
 * testo — perché all'agente la differenza non cambia cosa deve fare.
 */
export async function fetchViaScrapingFallback(url: string): Promise<string | null> {
  const apiKey = readSecret("SCRAPER_API_KEY");
  if (!apiKey) return null;

  const endpoint = readSecret("SCRAPER_API_URL") ?? DEFAULT_ENDPOINT;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["markdown"] }),
      signal: AbortSignal.timeout(FALLBACK_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error("[scraping-fallback] Servizio di riserva ha rifiutato la richiesta", {
        status: response.status,
      });
      return null;
    }

    const content = readContent(await response.json().catch(() => null));

    if (!content) {
      console.error("[scraping-fallback] Risposta senza contenuto testuale riconoscibile");
      return null;
    }

    return content;
  } catch (error) {
    console.error("[scraping-fallback] Errore di rete verso il servizio di riserva", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}
