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

/**
 * Come pubblicare, quando fra gli allegati ci sono sia foto sia video.
 *
 * # Perché è una scelta e non un'automatismo
 *
 * Perché Meta non pubblica post misti: su una Pagina un post è un album di
 * foto **oppure** un video, e su Instagram un video singolo è un Reel. Mandare
 * le due cose insieme fa rispondere "Media ID is not available", cioè un errore
 * che non nomina la causa.
 *
 * Automatizzare la scelta sarebbe peggio che chiederla: dalla generazione con
 * i media attivi escono **sempre** una grafica e un video, quindi "ce ne sono
 * due" è il caso normale e non un'eccezione. Scartarne uno in silenzio farebbe
 * pubblicare una cosa diversa da quella che l'agente ha guardato.
 */
export type PubblicazioneCome = "reel" | "foto";

/** Gli allegati divisi per tipo, nell'ordine in cui l'agente li ha messi. */
export function dividiPerTipo(media: MediaAllegato[]): {
  foto: MediaAllegato[];
  video: MediaAllegato[];
} {
  return {
    foto: media.filter((allegato) => allegato.kind === "image"),
    video: media.filter((allegato) => allegato.kind === "video"),
  };
}

/**
 * Cosa spedire davvero a Meta, dato ciò che è allegato e la scelta dell'agente.
 *
 * Restituisce **un solo tipo**: mai un elenco misto. Il video è uno solo,
 * perché sia un Reel sia un post video di Pagina ne accettano uno: degli altri
 * l'agente va avvisato, non silenziosamente ignorato — e a farlo è
 * l'interfaccia, che sa cosa ha in mano.
 */
export function selezionaPerPubblicazione(
  media: MediaAllegato[],
  come: PubblicazioneCome
): MediaAllegato[] {
  const { foto, video } = dividiPerTipo(media);
  if (come === "reel") return video.slice(0, 1);
  return foto;
}
