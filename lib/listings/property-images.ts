/**
 * Regole delle fotografie degli annunci.
 *
 * Modulo puro e senza database: le stesse costanti valgono al caricamento
 * (lato server, dove si rifiuta) e nella UI (lato client, dove si ridimensiona
 * prima di spedire). Duplicarle avrebbe garantito che prima o poi divergano,
 * facendo rifiutare dal server file che la UI riteneva validi.
 */

/**
 * Tipi ammessi: **solo raster**.
 *
 * L'SVG è escluso di proposito, come nel fascicolo documentale: è un documento
 * eseguibile, e queste immagini vengono servite dalla nostra stessa origine.
 * Un SVG caricato da un utente e restituito da noi sarebbe una XSS.
 */
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * Tetto per singola immagine, dopo il ridimensionamento fatto dal browser.
 *
 * Più basso dei 5 MB del fascicolo documentale perché qui il volume è un altro:
 * un immobile ha venti foto, un fascicolo un PDF ogni tanto. A 1920px di lato
 * lungo una foto ben compressa sta sotto il mezzo megabyte, quindi 2 MB è
 * abbondante per il caso legittimo e taglia il file non ridimensionato.
 */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Il data URI in base64 pesa circa 4/3 dei byte, più l'intestazione. */
export const MAX_IMAGE_DATA_URL_CHARS = Math.ceil(MAX_IMAGE_BYTES * 1.4);

/**
 * Numero massimo di foto per immobile.
 *
 * Allineato a quanto pubblicano i portali italiani: caricarne di più non le
 * farebbe comunque vedere, e riempirebbe il database per niente.
 */
export const MAX_IMAGES_PER_PROPERTY = 30;

/** Lato lungo a cui il browser riduce prima del caricamento. */
export const IMAGE_TARGET_LONG_EDGE = 1920;

export function isAllowedImageMimeType(mime: string): boolean {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime.toLowerCase());
}

/**
 * Estrae tipo e byte da un data URI, restituendo `null` se non è un'immagine
 * ammessa.
 *
 * Usata **sia in scrittura sia in lettura**: un tipo validato solo al
 * caricamento resterebbe scoperto se una riga arrivasse da un'altra strada
 * (un ripristino, un import, una modifica diretta al database).
 */
export function decodeImageDataUrl(
  dataUrl: string
): { mimeType: string; bytes: Buffer } | null {
  const separator = dataUrl.indexOf(";base64,");
  if (!dataUrl.startsWith("data:") || separator === -1) return null;

  const mimeType = dataUrl.slice("data:".length, separator).toLowerCase();
  if (!isAllowedImageMimeType(mimeType)) return null;

  const bytes = Buffer.from(dataUrl.slice(separator + ";base64,".length), "base64");
  if (bytes.length === 0) return null;

  return { mimeType, bytes };
}

/**
 * Percorso pubblico servito da `/api/images/[id]`.
 *
 * Fuori da `/api/properties/` di proposito: lì convive con `[id]`, e un
 * segmento statico accanto a uno dinamico è il tipo di ambiguità che funziona
 * finché qualcuno non aggiunge la rotta sbagliata. Questo URL finisce inoltre
 * dentro i feed dei portali, dove più corto è meglio.
 */
export function imagePath(imageId: string): string {
  return `/api/images/${imageId}`;
}

/**
 * Rende assoluto un URL del portafoglio.
 *
 * I portali scaricano le immagini da un server che non conosce la nostra
 * origine: nel feed XML un percorso relativo non è raggiungibile. I valori già
 * assoluti passano invariati, così la stessa colonna reggerà gli URL di un
 * object storage senza che questa funzione cambi.
 */
export function absoluteImageUrl(value: string, origin: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `${origin.replace(/\/+$/, "")}${value.startsWith("/") ? "" : "/"}${value}`;
}

/** Estensione di file per i tipi ammessi, usata nella chiave dell'oggetto. */
export function extensionForMimeType(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}
