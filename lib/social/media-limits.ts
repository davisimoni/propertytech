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
 * Tetto per singolo video.
 *
 * Il file non passa più dalle nostre funzioni: va **diretto al bucket** con un
 * indirizzo prefirmato, quindi i 4,5 MB di corpo che le serverless accettano
 * non c'entrano più. Il numero è una scelta nostra fra due limiti reali: Meta
 * arriva a 1 GB per un Reel, e una connessione mobile a 100 MB ci mette già
 * qualche minuto.
 *
 * Non è un valore dichiarativo: finisce **dentro la firma** dell'indirizzo
 * (`presignPutUrl` firma `content-length`), quindi un file più grande di
 * quanto dichiarato viene rifiutato dal fornitore con un 403. Verificato
 * contro il bucket reale.
 */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

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
