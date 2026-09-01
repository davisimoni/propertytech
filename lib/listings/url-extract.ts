import "server-only";
import { parsePublicHttpUrl } from "@/lib/net/safe-url";

/**
 * Recupero del testo di un annuncio da un link.
 *
 * # Cosa aspettarsi, detto subito
 *
 * Sui tre portali maggiori — Immobiliare.it, Idealista, Casa.it — questo
 * percorso quasi sempre non arriva in fondo: sono protetti da sistemi
 * anti-bot che valutano la firma TLS del client, e dagli IP di Vercel non
 * passano. È già stato verificato in passato, ed è il motivo per cui una
 * versione precedente di questa funzione era stata rimossa.
 *
 * Serve comunque, perché copre bene tutto il resto: il sito dell'agenzia
 * stessa, i portali locali, le schede pubblicate dai gestionali, i siti dei
 * costruttori. Lì funziona, e sono i casi in cui l'agente ha davvero un link
 * e non un testo da incollare.
 *
 * Quando il portale blocca, la funzione lo dice con un codice dedicato e la
 * UI indirizza al riquadro del testo. Un blocco è una risposta, non un
 * guasto: **non ci sono tentativi ripetuti, proxy o mascheramenti** per
 * aggirarlo. L'unica concessione è l'intestazione `User-Agent` di un browser,
 * senza la quale anche un normale sito d'agenzia rifiuta la richiesta.
 *
 * # Cosa si estrae
 *
 * OpenGraph, `<title>`, la meta description e i blocchi Schema.org, che sono
 * il posto dove i portali seri mettono prezzo e metratura in forma pulita. In
 * coda il testo visibile della pagina, come rete: molti siti d'agenzia hanno
 * la descrizione solo nel corpo. Non si interpreta nulla qui — la lettura la
 * fa il modello, che ha già le istruzioni per ignorare menù e cookie banner.
 */

const FETCH_TIMEOUT_MS = 12_000;

/** Oltre questa soglia si smette di leggere: una pagina d'annuncio non pesa così. */
const MAX_HTML_BYTES = 3_000_000;

/** Tetto al testo consegnato al modello, allineato al limite della rotta di import. */
const MAX_TEXT_CHARS = 18_000;

/**
 * I redirect si seguono a mano.
 *
 * Con `redirect: "follow"` la validazione dell'indirizzo varrebbe solo per il
 * primo salto: un link pubblico che rimanda a `169.254.169.254` porterebbe il
 * nostro server a leggere i metadata dell'istanza e a consegnarli come se
 * fossero un annuncio. Ogni tappa ripassa dalla stessa guardia.
 */
const MAX_REDIRECTS = 3;

export type UrlExtractCode =
  | "invalid_url"
  | "blocked_by_portal"
  | "not_reachable"
  | "not_html"
  | "too_little_content";

export class UrlExtractError extends Error {
  constructor(
    message: string,
    public readonly code: UrlExtractCode
  ) {
    super(message);
    this.name = "UrlExtractError";
  }
}

/** Il messaggio che l'agente legge quando il portale ci chiude la porta. */
export const PORTAL_BLOCKED_MESSAGE =
  "Non è stato possibile accedere direttamente al link per via delle protezioni del portale. Copia e incolla il testo dell'annuncio nel box sottostante.";

/**
 * Impronte dei sistemi anti-bot nel corpo della risposta.
 *
 * Servono perché il blocco non arriva sempre come codice di errore: Cloudflare
 * e DataDome rispondono spesso 200 con una pagina di verifica. Senza questo
 * controllo quella pagina finirebbe al modello, che ne ricaverebbe un annuncio
 * fatto di nulla invece di un messaggio utile.
 */
const IMPRONTE_ANTIBOT = [
  "cf-browser-verification",
  "cf_chl_opt",
  "just a moment",
  "attention required! | cloudflare",
  "checking your browser",
  "enable javascript and cookies to continue",
  "px-captcha",
  "datadome",
  "captcha-delivery.com",
  "unusual traffic from your computer",
  "verifica di sicurezza",
  // Il lettore esterno non fallisce: riferisce. Quando il portale gli mostra
  // un CAPTCHA risponde 200 con questo avviso e il contenuto vuoto, quindi
  // l'impronta va cercata anche nella sua risposta.
  "requiring captcha",
];

const UA_BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Legge il corpo fermandosi al tetto, invece di caricare in memoria qualunque cosa. */
async function leggiCorpoLimitato(response: Response): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  const pezzi: string[] = [];
  let byte = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      byte += value.byteLength;
      pezzi.push(decoder.decode(value, { stream: true }));
      if (byte >= MAX_HTML_BYTES) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return pezzi.join("");
}

/** Scarica la pagina, rivalidando l'indirizzo a ogni redirect. */
async function scaricaHtml(partenza: URL): Promise<{ html: string; finalUrl: string }> {
  let corrente = partenza;

  for (let salto = 0; salto <= MAX_REDIRECTS; salto++) {
    let response: Response;

    try {
      response = await fetch(corrente, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "User-Agent": UA_BROWSER,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "it-IT,it;q=0.9",
        },
      });
    } catch {
      throw new UrlExtractError(
        "Il sito non ha risposto in tempo o non è raggiungibile.",
        "not_reachable"
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const destinazione = response.headers.get("location");
      if (!destinazione) {
        throw new UrlExtractError("Il sito ha risposto con un rinvio incompleto.", "not_reachable");
      }

      // Risolto sull'indirizzo corrente: molti `Location` sono relativi.
      const prossimo = parsePublicHttpUrl(new URL(destinazione, corrente).toString());
      if (!prossimo.ok) {
        throw new UrlExtractError("Il link rimanda a un indirizzo non ammesso.", "invalid_url");
      }

      corrente = prossimo.url;
      continue;
    }

    if (response.status === 403 || response.status === 429 || response.status === 503) {
      throw new UrlExtractError(PORTAL_BLOCKED_MESSAGE, "blocked_by_portal");
    }

    if (!response.ok) {
      throw new UrlExtractError(
        `La pagina non è disponibile (errore ${response.status}).`,
        "not_reachable"
      );
    }

    const tipo = (response.headers.get("content-type") ?? "").toLowerCase();
    if (tipo && !tipo.includes("html") && !tipo.includes("xml")) {
      throw new UrlExtractError(
        "Il link non porta a una pagina web leggibile (sembra un file).",
        "not_html"
      );
    }

    const html = await leggiCorpoLimitato(response);
    const spia = html.slice(0, 4000).toLowerCase();

    if (IMPRONTE_ANTIBOT.some((impronta) => spia.includes(impronta))) {
      throw new UrlExtractError(PORTAL_BLOCKED_MESSAGE, "blocked_by_portal");
    }

    return { html, finalUrl: corrente.toString() };
  }

  throw new UrlExtractError("Il link rimbalza fra troppi indirizzi.", "not_reachable");
}

/** Entità HTML minime: quelle che compaiono davvero in un annuncio italiano. */
function decodeEntities(testo: string): string {
  return testo
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&euro;/gi, "€")
    .replace(/&deg;/gi, "°")
    .replace(/&agrave;/gi, "à")
    .replace(/&egrave;/gi, "è")
    .replace(/&eacute;/gi, "é")
    .replace(/&igrave;/gi, "ì")
    .replace(/&ograve;/gi, "ò")
    .replace(/&ugrave;/gi, "ù")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

/** Contenuto di un meta tag, cercato sia con `property` sia con `name`. */
function meta(html: string, nome: string): string | null {
  const attributo = nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const schemi = [
    new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${attributo}["'][^>]*\\scontent\\s*=\\s*["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*\\s(?:property|name)\\s*=\\s*["']${attributo}["']`,
      "i"
    ),
  ];

  for (const schema of schemi) {
    const trovato = html.match(schema);
    if (trovato?.[1]?.trim()) return decodeEntities(trovato[1].trim());
  }

  return null;
}

/**
 * Blocchi Schema.org.
 *
 * Si tengono solo i tipi che parlano di un immobile o di un prezzo: senza
 * filtro entrerebbero anche `WebSite`, `Organization` e le briciole di
 * navigazione, che allungano il testo e non aggiungono nulla.
 */
const TIPI_UTILI = [
  "product",
  "offer",
  "aggregateoffer",
  "realestatelisting",
  "residence",
  "apartment",
  "house",
  "singlefamilyresidence",
  "accommodation",
  "place",
  "realestateagent",
];

function estraiJsonLd(html: string): string[] {
  const blocchi: string[] = [];
  const schema = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const trovato of html.matchAll(schema)) {
    const grezzo = trovato[1]?.trim();
    if (!grezzo) continue;

    let dati: unknown;
    try {
      dati = JSON.parse(grezzo);
    } catch {
      // JSON-LD malformato: capita, e non è un motivo per fermare tutto.
      continue;
    }

    const coda: unknown[] = Array.isArray(dati) ? [...dati] : [dati];

    while (coda.length > 0 && blocchi.length < 8) {
      const nodo = coda.shift();
      if (!nodo || typeof nodo !== "object") continue;

      const oggetto = nodo as Record<string, unknown>;

      if (Array.isArray(oggetto["@graph"])) {
        coda.push(...oggetto["@graph"]);
        continue;
      }

      const tipo = String(oggetto["@type"] ?? "").toLowerCase();
      if (TIPI_UTILI.some((utile) => tipo.includes(utile))) {
        blocchi.push(JSON.stringify(oggetto).slice(0, 3000));
      }
    }
  }

  return blocchi;
}

/** Testo visibile, tolti script, stili e marcatura. */
function testoVisibile(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\u00A0]+/g, " ")
    .replace(/\n[ \t]*\n[ \t]*/g, "\n\n")   // righe rimaste vuote dopo la marcatura
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface UrlExtractResult {
  /** Testo grezzo pronto per il parser già esistente. */
  rawText: string;
  /** Indirizzo effettivamente letto, dopo gli eventuali rinvii. */
  finalUrl: string;
  /** Da dove è arrivato il testo: utile nei log e per capire un esito strano. */
  via: "diretto" | "lettore-esterno";
}

/**
 * Compone il testo dell'annuncio a partire dall'HTML.
 *
 * Separata dallo scaricamento, e pubblica, per un motivo solo: e' la parte
 * che si puo' provare. Il recupero ha bisogno della rete e di un sito che
 * risponda; questa lavora su una stringa, quindi i test esercitano il parser
 * vero invece di una sua copia - ed e' una copia che dice sempre di si'
 * quando l'originale dice di no.
 */
export function buildListingTextFromHtml(html: string): string {
  const titoloTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();

  const pezzi: string[] = [];
  const aggiungi = (etichetta: string, valore: string | null | undefined) => {
    if (valore && valore.trim()) pezzi.push(`${etichetta}: ${valore.trim()}`);
  };

  aggiungi("Titolo pagina", titoloTag ? decodeEntities(titoloTag) : null);
  aggiungi("Titolo annuncio", meta(html, "og:title"));
  aggiungi("Descrizione breve", meta(html, "og:description"));
  aggiungi("Descrizione", meta(html, "description"));
  aggiungi("Prezzo dichiarato", meta(html, "product:price:amount"));
  aggiungi("Valuta", meta(html, "product:price:currency"));

  const jsonLd = estraiJsonLd(html);
  if (jsonLd.length > 0) {
    pezzi.push(`Dati strutturati Schema.org:\n${jsonLd.join("\n")}`);
  }

  const corpo = testoVisibile(html);
  if (corpo.length > 0) {
    pezzi.push(`Testo della pagina:\n${corpo}`);
  }

  const rawText = pezzi.join("\n\n").slice(0, MAX_TEXT_CHARS);

  /*
   * Sotto questa soglia non c'è un annuncio da leggere.
   *
   * È il caso delle pagine costruite interamente in JavaScript: arriva uno
   * scheletro vuoto, con lo stesso codice 200 di una pagina piena. Senza
   * questo controllo il modello riceverebbe quattro parole di menù e
   * restituirebbe una scheda vuota, che l'agente scambierebbe per un annuncio
   * povero invece che per un recupero non riuscito.
   */
  if (rawText.replace(/\s+/g, " ").trim().length < 120) {
    throw new UrlExtractError(
      "La pagina non contiene abbastanza testo da leggere: probabilmente i dati vengono caricati dopo l'apertura. Copia e incolla il testo dell'annuncio nel box sottostante.",
      "too_little_content"
    );
  }

  return rawText;
}

/**
 * Ripiego: lettore esterno (Jina Reader).
 *
 * # Cosa fa e cosa non fa
 *
 * `r.jina.ai/<url>` scarica la pagina per conto nostro e ne restituisce il
 * testo in Markdown, già ripulito. Rende quindi anche le pagine costruite in
 * JavaScript, che al fetch diretto arrivano come scheletro vuoto.
 *
 * Non è una chiave universale, e conviene saperlo prima: misurato oggi su
 * pagine reali, **Casa.it passa** e restituisce prezzo, metratura e
 * descrizione; **Immobiliare.it e Idealista no**. Su quei due il lettore
 * riceve lo stesso CAPTCHA che riceviamo noi.
 *
 * # Perché non ci si può fidare del codice HTTP
 *
 * Quando il portale gli mostra un CAPTCHA, il lettore **risponde 200** con un
 * avviso e il contenuto vuoto: duecento byte invece di dodicimila. Trattarlo
 * come riuscito significherebbe consegnare al modello una pagina vuota e
 * restituire all'agente una scheda inventata dal nulla. Si guarda il
 * contenuto, non lo stato.
 *
 * # Terza parte
 *
 * L'indirizzo dell'annuncio esce verso un servizio esterno. È una pagina
 * pubblica e non contiene dati dei clienti dell'agenzia, ma resta una
 * dipendenza in più: se un giorno il servizio chiude, questo è un ripiego che
 * smette di funzionare, non una funzione che si rompe — il percorso diretto e
 * quello del testo incollato restano.
 *
 * `JINA_API_KEY` è facoltativa: senza, si usa il piano gratuito, che ha un
 * limite di richieste al minuto più basso.
 */
const JINA_READER_BASE = "https://r.jina.ai/";

/**
 * Più lungo del diretto, perché il lettore apre davvero la pagina e la
 * renderizza — ma non troppo: dopo di lui deve ancora girare il modello, e
 * l'intera rotta ha sessanta secondi. Il diretto quasi sempre fallisce subito
 * (un 403 arriva in un secondo), quindi il tetto vero da rispettare è questo.
 */
const JINA_TIMEOUT_MS = 20_000;

/** Sotto questa soglia la risposta del lettore è un guscio, non un annuncio. */
const MIN_JINA_CONTENT_CHARS = 200;

async function leggiConLettoreEsterno(bersaglio: URL): Promise<string> {
  const chiave = process.env.JINA_API_KEY;

  let response: Response;
  try {
    response = await fetch(`${JINA_READER_BASE}${bersaglio.toString()}`, {
      method: "GET",
      signal: AbortSignal.timeout(JINA_TIMEOUT_MS),
      headers: {
        Accept: "text/plain",
        ...(chiave ? { Authorization: `Bearer ${chiave}` } : {}),
      },
    });
  } catch {
    throw new UrlExtractError("Lettore esterno non raggiungibile.", "not_reachable");
  }

  if (!response.ok) {
    throw new UrlExtractError(`Lettore esterno: ${response.status}.`, "not_reachable");
  }

  const testo = (await leggiCorpoLimitato(response)).slice(0, MAX_TEXT_CHARS);

  if (IMPRONTE_ANTIBOT.some((impronta) => testo.toLowerCase().includes(impronta))) {
    throw new UrlExtractError(PORTAL_BLOCKED_MESSAGE, "blocked_by_portal");
  }

  // Si misura solo quello che viene DOPO l'intestazione del lettore: `Title:`
  // e `URL Source:` ci sono sempre, anche quando sotto non c'è niente, e
  // basterebbero da sole a superare una soglia misurata sul totale.
  const marcatore = "Markdown Content:";
  const taglio = testo.indexOf(marcatore);
  const contenuto = taglio >= 0 ? testo.slice(taglio + marcatore.length) : testo;

  if (contenuto.replace(/\s+/g, " ").trim().length < MIN_JINA_CONTENT_CHARS) {
    throw new UrlExtractError("Il lettore esterno non ha trovato contenuto.", "too_little_content");
  }

  return testo;
}

/**
 * Scarica la pagina e ne ricava il testo da dare al parser dell'annuncio.
 *
 * Due tentativi in ordine: prima il fetch diretto, poi il lettore esterno. Se
 * fallisce anche il secondo si rilancia **l'errore del primo**, perché è
 * quello che descrive il problema all'agente e gli dice cosa fare; "lettore
 * esterno non raggiungibile" non gli servirebbe a niente.
 */
export async function extractListingTextFromUrl(rawUrl: string): Promise<UrlExtractResult> {
  const indirizzo = parsePublicHttpUrl(rawUrl);
  if (!indirizzo.ok) {
    throw new UrlExtractError("Il link non sembra valido.", "invalid_url");
  }

  let erroreDiretto: UrlExtractError;

  try {
    const { html, finalUrl } = await scaricaHtml(indirizzo.url);
    return { rawText: buildListingTextFromHtml(html), finalUrl, via: "diretto" };
  } catch (error) {
    if (!(error instanceof UrlExtractError)) throw error;

    /*
     * `not_html` non passa dal ripiego.
     *
     * Il link porta a un file, non a una pagina: il lettore esterno non
     * cambierebbe l'esito, e il messaggio che l'agente ha già davanti dice
     * la cosa giusta. Una chiamata di rete in più per confermare un no.
     */
    if (error.code === "not_html") throw error;

    erroreDiretto = error;
  }

  try {
    const rawText = await leggiConLettoreEsterno(indirizzo.url);
    console.info("[url-extract] Letto tramite lettore esterno", {
      host: indirizzo.url.hostname,
      motivoDelDiretto: erroreDiretto.code,
    });
    return { rawText, finalUrl: indirizzo.url.toString(), via: "lettore-esterno" };
  } catch {
    throw erroreDiretto;
  }
}
