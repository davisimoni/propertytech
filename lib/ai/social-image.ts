import "server-only";
import { randomUUID } from "node:crypto";
import { readSecret } from "@/lib/env";
import { reportAiError } from "@/lib/observability/report-error";
import { putObject, readStorageConfig } from "@/lib/storage/object-storage";

/**
 * Immagine di corredo per un post generato dall'istruzione libera.
 *
 * # La regola che governa tutto: non si raffigura l'immobile
 *
 * Un'immagine generata che sembra la casa in vendita è pubblicità ingannevole,
 * punto. I portali la vietano, e un acquirente che arriva in visita e trova un
 * altro appartamento ha ragione lui. Per questo il prompt costruito qui
 * chiede **sempre** un'immagine concettuale o editoriale — un dettaglio, una
 * scena di lavoro, una composizione grafica — e **vieta** interni
 * fotorealistici che possano passare per la scheda di un immobile preciso.
 *
 * Le foto vere dell'immobile stanno in Portafoglio Immobili, e il pannello
 * allegati le offre con un pulsante dedicato: è quella la strada giusta per un
 * annuncio, e resta a un clic di distanza.
 *
 * # Perché il file finisce nel nostro bucket
 *
 * Perché l'indirizzo che OpenAI restituisce dura poche ore e non è nostro: a
 * scaricare l'immagine, in pubblicazione, sono i server di Meta. Un link
 * scaduto significherebbe un post pubblicato senza foto, scoperto dopo. Qui
 * l'immagine arriva in base64, la si scrive nel bucket e si restituisce
 * l'indirizzo pubblico, che è lo stesso che userà `publishToMeta`.
 *
 * # Perché il fallimento non è un errore
 *
 * Il testo è la ragione per cui l'agente ha premuto "Genera". Se l'immagine non
 * arriva — chiave assente, quota finita, prompt rifiutato — la generazione
 * restituisce comunque l'annuncio e il post, e l'agente allega una foto sua.
 * Far fallire tutto per l'illustrazione sarebbe scambiare il contorno per il
 * piatto.
 */

const ENDPOINT = "https://api.openai.com/v1/images/generations";
const MODELLO = "gpt-image-1";

/** Quadrata: è l'unico formato che regge su tutte e tre le piattaforme. */
const DIMENSIONE = "1024x1024";

/** Oltre, la richiesta resta appesa mentre l'agente guarda uno spinner. */
const TIMEOUT_MS = 90_000;

export interface MediaGenerato {
  url: string;
  type: string;
  /** Vero sempre, oggi: serve all'interfaccia per dichiararlo all'agente. */
  generatoDaAi: true;
}

/**
 * Il prompt per il modello di immagini, costruito attorno all'istruzione
 * dell'agente.
 *
 * L'istruzione entra come *tema*, non come descrizione di ciò che va
 * disegnato: "trilocale a Milano 250.000 euro" deve produrre un'immagine sul
 * tema della casa in città, non il ritratto di quel trilocale.
 */
function costruisciPrompt(istruzione: string): string {
  return [
    "Professional editorial image for an Italian real estate agency's social media post.",
    `Theme of the post: ${istruzione.slice(0, 700)}.`,
    "Style: realistic professional photography or clean conceptual composition, natural light,",
    "muted navy and warm neutral palette, shallow depth of field, calm and premium mood.",
    "STRICT RULES:",
    "- Do NOT depict a specific apartment or house interior that could be mistaken for the",
    "  property being advertised. Prefer details, hands, documents, keys, city context,",
    "  people at work, or abstract editorial compositions.",
    "- No text, no letters, no numbers anywhere in the image.",
    "- No software interfaces, no screens, no app mockups, no charts.",
    "- No brand logos, no watermarks.",
    "- No faces of recognisable public figures.",
  ].join("\n");
}

/**
 * Genera l'immagine e la deposita nel bucket. `null` quando non è possibile.
 *
 * Non lancia mai: ogni ragione di fallimento finisce nei log e la generazione
 * del testo prosegue.
 */
export async function generaImmagineSocial(
  organizationId: string,
  istruzione: string
): Promise<MediaGenerato | null> {
  const apiKey = readSecret("OPENAI_API_KEY");
  const storage = readStorageConfig();

  if (!apiKey || !storage) {
    // Non è un guasto: è un ambiente senza la chiave o senza il bucket. Il
    // testo esce lo stesso, e l'agente allega una foto sua.
    console.info("[social/image] Generazione saltata", {
      chiave: Boolean(apiKey),
      storage: Boolean(storage),
    });
    return null;
  }

  try {
    const risposta = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODELLO,
        prompt: costruisciPrompt(istruzione),
        size: DIMENSIONE,
        n: 1,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const corpo = (await risposta.json().catch(() => null)) as {
      data?: { b64_json?: string; url?: string }[];
      error?: { message?: string; type?: string };
    } | null;

    if (!risposta.ok || !corpo) {
      // Nel log il messaggio del fornitore, non solo lo stato: "quota
      // superata" e "prompt rifiutato" portano a due azioni diverse.
      console.error("[social/image] Generazione rifiutata", {
        status: risposta.status,
        tipo: corpo?.error?.type ?? null,
        messaggio: corpo?.error?.message ?? null,
      });
      return null;
    }

    const base64 = corpo.data?.[0]?.b64_json;
    if (!base64) {
      console.error("[social/image] Risposta senza immagine");
      return null;
    }

    const bytes = Buffer.from(base64, "base64");

    /*
     * `ai-` nel nome, e non solo nei metadati.
     *
     * Il prefisso resta leggibile nell'indirizzo pubblico anche mesi dopo,
     * quando l'immagine è già in un post: se qualcuno dovesse chiedersi se una
     * foto è stata generata, la risposta è nel nome del file e non in una
     * colonna di un database che nel frattempo può essere cambiata.
     */
    const objectKey = `${organizationId}/social/ai-${randomUUID()}.png`;
    const url = await putObject(storage, objectKey, bytes, "image/png");

    return { url, type: "image/png", generatoDaAi: true };
  } catch (error) {
    reportAiError(error, "social/image");
    return null;
  }
}
