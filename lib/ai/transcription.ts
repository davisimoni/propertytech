import "server-only";
import { readSecret } from "@/lib/env";
import { cleanTranscript } from "./transcript-quality";

/**
 * Step Speech-to-Text del Modulo 4.
 *
 * Claude non accetta input audio: la nota vocale va trascritta a monte e solo
 * il testo viene passato al generatore di report (CLAUDE.md §3, Modulo 4).
 *
 * L'implementazione è volutamente agnostica rispetto al provider: qualsiasi
 * servizio con API compatibile OpenAI-Whisper (`multipart/form-data` con campo
 * `file`, risposta `{ text }`) funziona configurando le due variabili sotto.
 * Vincolo GDPR: scegliere un endpoint con processing in UE.
 */

const STT_TIMEOUT_MS = 120_000;

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export const SUPPORTED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/webm",
  "audio/ogg",
];

export class TranscriptionError extends Error {
  constructor(
    message: string,
    public readonly code: "not_configured" | "upstream_error" | "timeout" | "empty_result"
  ) {
    super(message);
    this.name = "TranscriptionError";
  }
}

/** Endpoint usato quando è configurata la sola `OPENAI_API_KEY`. */
const OPENAI_TRANSCRIPTION_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";

/**
 * Risolve provider e credenziale della trascrizione.
 *
 * `STT_API_URL`/`STT_API_KEY` hanno la precedenza e permettono di puntare a un
 * provider con processing in UE, come richiede la Data Residency (CLAUDE.md §5).
 * `OPENAI_API_KEY` è la scorciatoia per partire subito con Whisper di OpenAI,
 * i cui server sono però fuori UE: adatta allo sviluppo, da sostituire con un
 * endpoint europeo prima di trattare note vocali reali.
 */
function resolveTranscriptionProvider(): { endpoint: string; apiKey: string } | null {
  const explicitKey = readSecret("STT_API_KEY");
  const explicitUrl = readSecret("STT_API_URL");

  if (explicitKey && explicitUrl) {
    return { endpoint: explicitUrl, apiKey: explicitKey };
  }

  const openaiKey = readSecret("OPENAI_API_KEY");
  if (openaiKey) {
    return { endpoint: explicitUrl ?? OPENAI_TRANSCRIPTION_ENDPOINT, apiKey: openaiKey };
  }

  return null;
}

export function isTranscriptionConfigured(): boolean {
  return resolveTranscriptionProvider() !== null;
}

/**
 * Trascrive l'audio e restituisce il solo testo.
 *
 * Il buffer audio resta in memoria per la durata della chiamata e non viene mai
 * persistito: è il requisito GDPR sui dati vocali (CLAUDE.md §5).
 */
export async function transcribeAudio(audio: Buffer, filename: string, mimeType: string): Promise<string> {
  const provider = resolveTranscriptionProvider();

  if (!provider) {
    throw new TranscriptionError(
      "Trascrizione audio non configurata su questo ambiente. Usa le note testuali oppure configura un provider Speech-to-Text.",
      "not_configured"
    );
  }

  const { endpoint, apiKey } = provider;

  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), filename);
  formData.append("model", process.env.STT_MODEL ?? "whisper-1");
  formData.append("language", "it");

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(STT_TIMEOUT_MS),
    });
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
    console.error("[transcription] Request failed", { isTimeout });
    throw new TranscriptionError(
      isTimeout
        ? "La trascrizione ha impiegato troppo tempo. Riprova con una nota più breve."
        : "Servizio di trascrizione non raggiungibile.",
      isTimeout ? "timeout" : "upstream_error"
    );
  }

  if (!response.ok) {
    // Il corpo della risposta può contenere frammenti della trascrizione:
    // si logga solo lo status, mai il payload (PII di terzi).
    console.error("[transcription] Provider returned error", { status: response.status });
    throw new TranscriptionError("Trascrizione non riuscita.", "upstream_error");
  }

  const payload = (await response.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";

  if (!text) {
    throw new TranscriptionError(
      "Non è stato possibile riconoscere alcun contenuto nella nota vocale.",
      "empty_result"
    );
  }

  // Whisper non restituisce testo vuoto sul silenzio: inventa. Le allucinazioni
  // vanno tolte qui, all'unico punto in cui una trascrizione entra nel sistema,
  // così nessun consumatore a valle può dimenticarsene — e il report che esce
  // dall'agenzia non contiene frasi mai pronunciate.
  const cleaned = cleanTranscript(text);

  if (cleaned.removedHallucinations > 0 || cleaned.removedRepetitions > 0) {
    // Si loggano solo i conteggi: il testo è dato personale di terzi.
    console.warn("[transcription] Trascrizione ripulita", {
      hallucinations: cleaned.removedHallucinations,
      repetitions: cleaned.removedRepetitions,
    });
  }

  if (cleaned.isEmpty) {
    throw new TranscriptionError(
      "Non è stato riconosciuto parlato nella nota vocale. Riprova registrando più vicino al microfono.",
      "empty_result"
    );
  }

  return cleaned.text;
}
