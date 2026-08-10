import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  socialContentSchema,
  TONE_LABELS,
  type SocialContent,
  type SocialGenerationRequest,
} from "./social-schema";

const client = new Anthropic();

const GENERATOR_MODEL = "claude-opus-5";

const TONE_GUIDANCE: Record<SocialGenerationRequest["tone"], string> = {
  professionale:
    "Tono sobrio e informativo. Punta su dati concreti, metrature, finiture e contesto urbano. Nessuna enfasi retorica.",
  emozionale:
    "Tono caldo e narrativo. Fai immaginare la vita quotidiana negli spazi: la luce del mattino, la colazione sul balcone. Evita comunque frasi fatte.",
  lussuoso:
    "Tono ricercato e sobrio, mai sfarzoso. Valorizza esclusività, materiali e riservatezza. Frasi eleganti e asciutte.",
  giovane:
    "Tono diretto e dinamico, adatto a un pubblico under 35. Frasi brevi, ritmo veloce, linguaggio contemporaneo senza gergo forzato.",
};

function buildSystemPrompt(tone: SocialGenerationRequest["tone"]): string {
  return `Sei un copywriter immobiliare italiano che produce contenuti per agenzie. Da poche note sintetiche generi tre formati distinti per lo stesso immobile.

# Tono di voce richiesto: ${TONE_LABELS[tone]}
${TONE_GUIDANCE[tone]}

# Regole trasversali
- Scrivi in italiano impeccabile, senza calchi dall'inglese.
- Usa SOLO le informazioni presenti nelle note fornite. Non inventare metrature, prezzi, numero di locali, classe energetica o servizi non menzionati.
- Se un dato utile manca, ometti l'argomento invece di riempirlo con un'ipotesi.
- Niente affermazioni non verificabili ("il migliore della città", "occasione irripetibile").
- Rispetta le norme sulla pubblicità immobiliare: se il prezzo è indicato riportalo fedelmente, altrimenti non alluderne.

# Adattamento per canale
- ANNUNCIO PORTALI: registro informativo, struttura scansionabile, ottimizzato per la ricerca locale. Ripeti in modo naturale zona e tipologia, senza keyword stuffing.
- POST SOCIAL: discorsivo e visivo, emoji dosate (non più di una ogni due righe), call to action esplicita.
- SCRIPT REEL: pensato per essere girato con uno smartphone dall'agente. Ogni scena ha un'indicazione di ripresa concreta e realizzabile da una persona sola. Il totale deve stare in circa 30 secondi di parlato.`;
}

export class SocialGenerationError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_response" | "refused" | "upstream_error"
  ) {
    super(message);
    this.name = "SocialGenerationError";
  }
}

/**
 * Genera i tre formati in un'unica chiamata: condividono lo stesso brief e la
 * stessa interpretazione delle note, quindi separarli produrrebbe contenuti
 * incoerenti fra loro a costo e latenza maggiori.
 */
export async function generateSocialContent(
  input: SocialGenerationRequest
): Promise<SocialContent> {
  const response = await client.messages
    .parse({
      model: GENERATOR_MODEL,
      max_tokens: 8192,
      system: buildSystemPrompt(input.tone),
      output_config: {
        effort: "medium",
        format: zodOutputFormat(socialContentSchema),
      },
      messages: [
        {
          role: "user",
          content: `Immobile: ${input.propertyTitle}

Punti chiave forniti dall'agente:
${input.keyPoints}

Genera i tre formati richiesti dallo schema.`,
        },
      ],
    })
    .catch((error) => {
      console.error("[social-generator] Anthropic call failed", error);
      throw new SocialGenerationError(
        "Il servizio di generazione contenuti non è al momento disponibile.",
        "upstream_error"
      );
    });

  if (response.stop_reason === "refusal") {
    throw new SocialGenerationError(
      "La richiesta non può essere elaborata per policy di sicurezza del modello.",
      "refused"
    );
  }

  if (!response.parsed_output) {
    throw new SocialGenerationError("Risposta AI non interpretabile.", "invalid_response");
  }

  return response.parsed_output;
}
