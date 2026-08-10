import "server-only";
import { MAX_AUDIO_BYTES } from "@/lib/ai/transcription";

/**
 * Scaricamento dei media in arrivo dalla WhatsApp Cloud API.
 *
 * Serve per le note vocali: un cliente che risponde a voce invece che a testo è
 * la norma su WhatsApp, e finché l'agente AI leggeva solo il testo quel
 * messaggio andava perso — il lead restava fermo senza che nessuno se ne
 * accorgesse.
 *
 * L'audio **non viene mai scritto su disco né in database**: resta in memoria
 * per il tempo della trascrizione e poi sparisce. È il requisito sui dati
 * vocali di CLAUDE.md §5, e vale anche qui: una nota vocale può contenere la
 * voce e i dati personali di un terzo.
 */

const GRAPH_API_VERSION = "v21.0";
const MEDIA_TIMEOUT_MS = 15_000;

export class MediaDownloadError extends Error {
  constructor(
    message: string,
    readonly reason: "not_found" | "too_large" | "network" | "unsupported"
  ) {
    super(message);
    this.name = "MediaDownloadError";
  }
}

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
  /** Nome di comodo per il caricamento multipart verso lo STT. */
  filename: string;
}

/**
 * Scarica un media in due passaggi, come impone la Cloud API.
 *
 * Prima si chiede l'URL a partire dall'identificativo, poi si scarica: quell'URL
 * è temporaneo e richiede comunque il token, quindi non può essere passato a
 * terzi né messo in cache.
 */
export async function downloadWhatsAppMedia(
  mediaId: string,
  accessToken: string
): Promise<DownloadedMedia> {
  let metadata: { url?: string; mime_type?: string; file_size?: number };

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(mediaId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      throw new MediaDownloadError(
        `La Cloud API ha risposto ${response.status} per il media.`,
        response.status === 404 ? "not_found" : "network"
      );
    }

    metadata = await response.json();
  } catch (error) {
    if (error instanceof MediaDownloadError) throw error;
    throw new MediaDownloadError("Media non raggiungibile.", "network");
  }

  if (!metadata.url) {
    throw new MediaDownloadError("La Cloud API non ha restituito l'indirizzo del media.", "not_found");
  }

  // Controllo prima di scaricare, quando la dimensione è dichiarata: evita di
  // tirare giù venticinque megabyte per poi scartarli.
  if (typeof metadata.file_size === "number" && metadata.file_size > MAX_AUDIO_BYTES) {
    throw new MediaDownloadError("Nota vocale troppo lunga.", "too_large");
  }

  try {
    const response = await fetch(metadata.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new MediaDownloadError(`Scaricamento non riuscito (${response.status}).`, "network");
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Ricontrollo sui byte effettivi: `file_size` è dichiarato dal mittente e
    // può mancare o mentire.
    if (buffer.byteLength > MAX_AUDIO_BYTES) {
      throw new MediaDownloadError("Nota vocale troppo lunga.", "too_large");
    }

    // Il tipo arriva come `audio/ogg; codecs=opus`: allo STT va la sola parte
    // principale, che è quella che i provider riconoscono.
    const mimeType = (metadata.mime_type ?? "audio/ogg").split(";")[0]!.trim();

    return { buffer, mimeType, filename: `nota-vocale.${extensionFor(mimeType)}` };
  } catch (error) {
    if (error instanceof MediaDownloadError) throw error;
    throw new MediaDownloadError("Scaricamento del media non riuscito.", "network");
  }
}

/** Estensione coerente col tipo: alcuni provider STT la usano per decodificare. */
function extensionFor(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/x-m4a": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
  };

  return map[mimeType] ?? "ogg";
}
