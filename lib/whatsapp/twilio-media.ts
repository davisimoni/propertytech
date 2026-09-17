import "server-only";
import { MAX_WEBHOOK_AUDIO_BYTES } from "@/lib/ai/transcription";
import type { DownloadedMedia } from "./media";

/**
 * Scarica un media da Twilio.
 *
 * # Due indirizzi, non uno
 *
 * `MediaUrl0` punta all'API di Twilio, che risponde con un redirect verso un
 * indirizzo firmato su CDN. La prima richiesta va autenticata con le
 * credenziali dell'agenzia (Account SID e Auth Token, come prevede Twilio);
 * la seconda no — e non deve esserlo: l'intestazione `Authorization` inviata
 * a un dominio diverso consegnerebbe le credenziali dell'agenzia a terzi.
 *
 * # Perché una lista di host
 *
 * L'indirizzo arriva dentro un webhook. La firma di Twilio lo autentica, ma
 * la lista degli host è la seconda barriera che impedisce a una richiesta
 * manomessa di far scaricare al nostro server un indirizzo interno (SSRF), e
 * vale anche per il redirect, che è un indirizzo scelto da chi risponde.
 */

const HOST_AMMESSI = ["twilio.com", "twiliocdn.com", "amazonaws.com"];
const TIMEOUT_MS = 15_000;
const MAX_REDIRECT = 3;

export class TwilioMediaError extends Error {
  constructor(
    message: string,
    readonly reason: "unsupported" | "too_large" | "network" | "not_found"
  ) {
    super(message);
    this.name = "TwilioMediaError";
  }
}

function hostAmmesso(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;

  const host = url.hostname.toLowerCase();
  return HOST_AMMESSI.some((ammesso) => host === ammesso || host.endsWith(`.${ammesso}`));
}

/** Estensione dal tipo dichiarato: Whisper la usa per riconoscere il formato. */
function estensione(mimeType: string): string {
  const tipo = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (tipo === "audio/ogg" || tipo === "audio/opus") return "ogg";
  if (tipo === "audio/mpeg" || tipo === "audio/mp3") return "mp3";
  if (tipo === "audio/mp4" || tipo === "audio/m4a" || tipo === "audio/x-m4a") return "m4a";
  if (tipo === "audio/wav" || tipo === "audio/x-wav") return "wav";
  if (tipo === "audio/webm") return "webm";
  if (tipo === "audio/amr") return "amr";
  return "ogg";
}

export async function downloadTwilioMedia(params: {
  mediaUrl: string;
  contentType: string;
  accountSid: string;
  authToken: string;
}): Promise<DownloadedMedia> {
  if (!hostAmmesso(params.mediaUrl)) {
    throw new TwilioMediaError("Indirizzo del media non riconosciuto come Twilio.", "unsupported");
  }

  const autorizzazione = `Basic ${Buffer.from(`${params.accountSid}:${params.authToken}`).toString("base64")}`;
  let indirizzo = params.mediaUrl;
  let risposta: Response | null = null;

  for (let salto = 0; salto <= MAX_REDIRECT; salto++) {
    // Le credenziali solo alla prima chiamata, che è l'unica verso Twilio.
    const intestazioni = salto === 0 ? { Authorization: autorizzazione } : undefined;

    try {
      risposta = await fetch(indirizzo, {
        headers: intestazioni,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new TwilioMediaError("Media Twilio non raggiungibile.", "network");
    }

    if (risposta.status >= 300 && risposta.status < 400) {
      const destinazione = risposta.headers.get("location");
      if (!destinazione) {
        throw new TwilioMediaError("Redirect senza destinazione.", "network");
      }
      indirizzo = new URL(destinazione, indirizzo).toString();
      if (!hostAmmesso(indirizzo)) {
        throw new TwilioMediaError("Redirect verso un indirizzo non ammesso.", "unsupported");
      }
      continue;
    }

    break;
  }

  if (!risposta || !risposta.ok) {
    throw new TwilioMediaError(
      `Twilio ha risposto ${risposta?.status ?? 0} per il media.`,
      risposta?.status === 404 ? "not_found" : "network"
    );
  }

  // Il tetto si controlla PRIMA di leggere il corpo quando la dimensione è
  // dichiarata: scaricare venti megabyte per poi scartarli è tempo dentro un
  // webhook che il cliente sta aspettando.
  const dichiarata = Number(risposta.headers.get("content-length") ?? "0");
  if (dichiarata > MAX_WEBHOOK_AUDIO_BYTES) {
    throw new TwilioMediaError("Audio troppo lungo per essere elaborato.", "too_large");
  }

  const buffer = Buffer.from(await risposta.arrayBuffer());
  if (buffer.length > MAX_WEBHOOK_AUDIO_BYTES) {
    throw new TwilioMediaError("Audio troppo lungo per essere elaborato.", "too_large");
  }

  const mimeType = risposta.headers.get("content-type") ?? params.contentType;
  return { buffer, mimeType, filename: `nota-vocale.${estensione(mimeType)}` };
}
