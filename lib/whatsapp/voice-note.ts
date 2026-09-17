import "server-only";
import { downloadWhatsAppMedia, MediaDownloadError } from "./media";
import { downloadTwilioMedia, TwilioMediaError } from "./twilio-media";
import { decryptAccessToken } from "./credentials";
import {
  isTranscriptionConfigured,
  transcribeAudio,
  MAX_WEBHOOK_AUDIO_BYTES,
  STT_WEBHOOK_TIMEOUT_MS,
  TranscriptionError,
} from "@/lib/ai/transcription";
import { cleanTranscript } from "@/lib/ai/transcript-quality";

/**
 * Nota vocale in arrivo → testo per l'agente di qualificazione.
 *
 * Su WhatsApp rispondere a voce è normale, e finché l'agente leggeva solo il
 * testo quei messaggi venivano ignorati in silenzio: il cliente aveva risposto,
 * il lead restava fermo, e nessuno se ne accorgeva fino a quando l'agente non
 * apriva la chat a mano.
 */

export type VoiceNoteOutcome =
  | { ok: true; text: string }
  /**
   * Fallita: `reply` è il messaggio da mandare al cliente. Non si resta mai in
   * silenzio — chi ha appena parlato al telefono si aspetta una risposta, e
   * un silenzio lo convince che il numero non è attivo.
   */
  | { ok: false; reason: string; reply: string };

/** Risposte al cliente: forma di cortesia, è l'agenzia che parla (CLAUDE.md §1). */
const REPLIES = {
  notConfigured:
    "Grazie per il messaggio vocale. Al momento non riusciamo ad ascoltarlo: può scriverci la sua richiesta in un messaggio di testo?",
  tooLarge:
    "Grazie per il messaggio vocale, purtroppo è troppo lungo per essere elaborato. Può riassumerlo in un testo o in un vocale più breve?",
  unreadable:
    "Grazie per il messaggio vocale, ma non siamo riusciti a capirlo bene. Può ripetere scrivendo, così non perdiamo nessun dettaglio?",
  failed:
    "Grazie per il messaggio vocale. Non siamo riusciti ad ascoltarlo: può scriverci la sua richiesta?",
} as const;

/**
 * Trascrive byte audio gia' in nostro possesso.
 *
 * Separata dal percorso Meta perche' i due trasporti procurano l'audio in modi
 * diversi: da Meta si scarica con un token, dal collegamento via QR i byte li
 * ha gia' il microservizio e ce li consegna nel webhook. Da qui in poi il
 * trattamento e' identico, ed e' giusto che lo sia: la pulizia della
 * trascrizione e le risposte al cliente non devono dipendere da come e'
 * arrivato il file.
 */
export async function transcribeVoiceBuffer(
  audio: Buffer,
  filename: string,
  mimeType: string
): Promise<VoiceNoteOutcome> {
  if (!isTranscriptionConfigured()) {
    return { ok: false, reason: "stt_not_configured", reply: REPLIES.notConfigured };
  }

  if (audio.length > MAX_AUDIO_BYTES) {
    return { ok: false, reason: "too_large", reply: REPLIES.tooLarge };
  }

  try {
    const raw = await transcribeAudio(audio, filename, mimeType, {
      timeoutMs: STT_WEBHOOK_TIMEOUT_MS,
    });

    // Stesso filtro dei report post-visita: su un audio breve o silenzioso
    // Whisper inventa frasi plausibili, e qualificare un lead su parole che il
    // cliente non ha mai detto e' peggio che non trascrivere affatto.
    const cleaned = cleanTranscript(raw);

    if (!cleaned.text.trim()) {
      return { ok: false, reason: "empty_transcript", reply: REPLIES.unreadable };
    }

    return { ok: true, text: cleaned.text.trim() };
  } catch (error) {
    // Audio senza parlato, o con le sole frasi inventate che il filtro toglie:
    // il fornitore lo segnala come `empty_result`. Al cliente si chiede di
    // ripetere scrivendo, non "non siamo riusciti ad ascoltarlo": lì il
    // problema non è il servizio, è che nel vocale non c'era una richiesta.
    if (error instanceof TranscriptionError && error.code === "empty_result") {
      return { ok: false, reason: "empty_transcript", reply: REPLIES.unreadable };
    }

    // Nessun dettaglio e nessun contenuto nei log: e' la voce di una persona.
    console.error("[whatsapp/voice-note] Trascrizione non riuscita", {
      reason: "transcription_failed",
    });
    return { ok: false, reason: "transcription_failed", reply: REPLIES.failed };
  }
}

/**
 * Tetto ai byte audio accettati dal webhook: una nota vocale vera sta molto
 * sotto. Definito con il timeout dei webhook in `lib/ai/transcription.ts`,
 * così il limite è uno solo per tutti i canali.
 */
export const MAX_AUDIO_BYTES = MAX_WEBHOOK_AUDIO_BYTES;

/**
 * Scarica, trascrive e ripulisce una nota vocale.
 *
 * Non lancia mai: qualunque errore diventa una risposta sensata per il cliente.
 * Una nota vocale illeggibile non deve interrompere una conversazione di
 * qualificazione già avviata.
 */
export async function transcribeVoiceNote(
  mediaId: string,
  encryptedAccessToken: string | null
): Promise<VoiceNoteOutcome> {
  // Verificato prima di scaricare: senza provider STT il download sarebbe
  // banda e tempo spesi per buttare via il risultato.
  if (!isTranscriptionConfigured()) {
    return { ok: false, reason: "stt_not_configured", reply: REPLIES.notConfigured };
  }

  const accessToken = decryptAccessToken(encryptedAccessToken);
  if (!accessToken) {
    return { ok: false, reason: "no_access_token", reply: REPLIES.failed };
  }

  try {
    const media = await downloadWhatsAppMedia(mediaId, accessToken);
    const raw = await transcribeAudio(media.buffer, media.filename, media.mimeType, {
      timeoutMs: STT_WEBHOOK_TIMEOUT_MS,
    });

    // Stesso filtro dei report post-visita: su un audio breve o silenzioso
    // Whisper inventa frasi plausibili ("Sottotitoli e revisione a cura di…"),
    // e darle in pasto all'agente significherebbe qualificare un lead su parole
    // che il cliente non ha mai detto.
    const cleaned = cleanTranscript(raw);

    if (!cleaned.text.trim()) {
      return { ok: false, reason: "empty_transcript", reply: REPLIES.unreadable };
    }

    return { ok: true, text: cleaned.text.trim() };
  } catch (error) {
    if (error instanceof MediaDownloadError && error.reason === "too_large") {
      return { ok: false, reason: "too_large", reply: REPLIES.tooLarge };
    }

    // Vocale senza parlato: si chiede di ripetere scrivendo, non si dice che
    // non siamo riusciti ad ascoltarlo.
    if (error instanceof TranscriptionError && error.code === "empty_result") {
      return { ok: false, reason: "empty_transcript", reply: REPLIES.unreadable };
    }

    // Senza dettagli tecnici e senza il contenuto: è una registrazione vocale
    // di una persona, e non deve finire nei log.
    console.error("[whatsapp/voice-note] Trascrizione non riuscita", {
      reason: error instanceof MediaDownloadError ? error.reason : "transcription_failed",
    });

    return { ok: false, reason: "transcription_failed", reply: REPLIES.failed };
  }
}

/**
 * Come `transcribeVoiceNote`, ma per i vocali che arrivano da Twilio.
 *
 * Cambia solo da dove si scarica l'audio: lì un id di media della Cloud API,
 * qui l'indirizzo firmato che Twilio mette nel webhook. Trascrizione, filtro
 * delle allucinazioni e risposte al cliente restano gli stessi, perché per chi
 * ha parlato al telefono il provider scelto dall'agenzia non è una distinzione
 * che lo riguarda.
 */
export async function transcribeTwilioVoiceNote(params: {
  mediaUrl: string;
  contentType: string;
  accountSid: string;
  encryptedAuthToken: string | null;
}): Promise<VoiceNoteOutcome> {
  if (!isTranscriptionConfigured()) {
    return { ok: false, reason: "stt_not_configured", reply: REPLIES.notConfigured };
  }

  const authToken = decryptAccessToken(params.encryptedAuthToken);
  if (!authToken) {
    return { ok: false, reason: "no_auth_token", reply: REPLIES.failed };
  }

  try {
    const media = await downloadTwilioMedia({
      mediaUrl: params.mediaUrl,
      contentType: params.contentType,
      accountSid: params.accountSid,
      authToken,
    });

    return await transcribeVoiceBuffer(media.buffer, media.filename, media.mimeType);
  } catch (error) {
    if (error instanceof TwilioMediaError && error.reason === "too_large") {
      return { ok: false, reason: "too_large", reply: REPLIES.tooLarge };
    }

    console.error("[whatsapp/voice-note] Media Twilio non scaricato", {
      reason: error instanceof TwilioMediaError ? error.reason : "download_failed",
    });

    return { ok: false, reason: "transcription_failed", reply: REPLIES.failed };
  }
}
