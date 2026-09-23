/**
 * Cosa può portare un post social: quanti allegati, e di che tipo.
 *
 * # Perché in un modulo suo
 *
 * Perché gli stessi valori servono in tre punti che devono dire la stessa cosa:
 * il pannello che smette di accettare file, la rotta che li carica e quella
 * che pubblica. Tre copie divergono al primo ritocco, e la forma che la
 * divergenza prende è la peggiore — un'interfaccia che accetta la decima foto
 * sopra una rotta che la rifiuta.
 *
 * Vive in un file senza `server-only` perché lo legge anche il browser.
 */

/**
 * Il valore è il limite di Instagram: un carosello si ferma a 10 elementi, e
 * oltre quello l'API risponde con un errore. Non è una scelta nostra.
 */
export const MAX_SOCIAL_MEDIA = 10;

export type MediaKind = "image" | "video";

/** Un allegato con il suo tipo: l'indirizzo da solo non dice se è foto o video. */
export interface MediaAllegato {
  url: string;
  kind: MediaKind;
}

/**
 * Formati video ammessi.
 *
 * MP4 e MOV, cioè quello che esce dai telefoni e quello che Meta documenta.
 * Gli altri contenitori (MKV, AVI, WebM) Instagram li rifiuta durante
 * l'elaborazione: accettarli qui significherebbe far aspettare un minuto per
 * un errore che sapevamo già.
 */
export const ALLOWED_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime"] as const;

/**
 * Tetto per singolo video, oggi.
 *
 * Non è un limite di Meta, che arriva a 1 GB per un Reel: è il limite della
 * strada che il file percorre. Il video viaggia in un data URI dentro il corpo
 * JSON di `/api/social/media`, e le funzioni serverless accettano **4,5 MB di
 * richiesta**; il base64 gonfia i byte di un terzo, quindi tre megabyte è
 * quanto ci sta davvero con un margine.
 *
 * Tre megabyte sono pochi: bastano per una clip di dieci secondi molto
 * compressa, non per un Reel. Il numero sale quando il caricamento andrà
 * diretto al bucket con un indirizzo prefirmato, saltando la funzione — ed è
 * per questo che il tetto vive qui, in un posto solo, invece di essere scritto
 * dentro la rotta.
 */
export const MAX_VIDEO_BYTES = 3 * 1024 * 1024;

/** Il data URI in base64 pesa circa 4/3 dei byte, più l'intestazione. */
export const MAX_VIDEO_DATA_URL_CHARS = Math.ceil(MAX_VIDEO_BYTES * 1.4);

export function isAllowedVideoMimeType(mime: string): boolean {
  return (ALLOWED_VIDEO_MIME_TYPES as readonly string[]).includes(mime.toLowerCase());
}

/** L'estensione con cui salvare nel bucket, dal tipo dichiarato. */
export function videoExtensionForMimeType(mime: string): string {
  return mime.toLowerCase() === "video/quicktime" ? "mov" : "mp4";
}

/**
 * Il tipo di un allegato ricavato dall'indirizzo.
 *
 * Funziona sugli indirizzi del bucket, dove l'estensione la scriviamo noi al
 * caricamento. **Non** funziona su `/api/social/media/<id>`, che di estensione
 * non ne ha: per quelli il tipo sta nella riga del database. Chi chiama deve
 * sapere quale dei due casi ha in mano, ed è il motivo per cui questa funzione
 * non si chiama `tipoDi`.
 */
export function kindFromExtension(url: string): MediaKind {
  // La query va tolta: un indirizzo firmato porta parametri dopo il nome.
  const percorso = url.split("?")[0] ?? url;
  return /\.(mp4|mov|m4v)$/i.test(percorso) ? "video" : "image";
}

/** Vero se fra gli allegati c'è almeno un video. */
export function contieneVideo(media: MediaAllegato[]): boolean {
  return media.some((allegato) => allegato.kind === "video");
}
