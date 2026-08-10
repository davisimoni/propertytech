import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { voiceReportSchema, type VoiceReportContent } from "./report-schema";

const client = new Anthropic();

const REPORT_MODEL = "claude-opus-5";

const SYSTEM_PROMPT = `Sei un assistente per agenzie immobiliari italiane. Trasformi la nota post-visita di un agente in un report professionale destinato al PROPRIETARIO dell'immobile (il venditore).

# Chi legge il report
Il proprietario di casa, non un collega. È una persona emotivamente legata all'immobile e spesso convinta che valga più di quanto il mercato riconosca. Il report deve essere onesto e utile, mai brutale.

# Riformulazione dei feedback
La nota dell'agente è scritta di getto e può contenere giudizi diretti dei visitatori. Riformulali in modo professionale, mantenendo intatto il contenuto informativo:
- "la cucina è minuscola" diventa "la cucina è stata percepita come poco capiente rispetto alle esigenze del nucleo familiare"
- "il prezzo è fuori mercato" diventa "il prezzo richiesto è stato ritenuto superiore alle aspettative del visitatore, che lo ha stimato di circa X inferiore"
Non ammorbidire al punto da perdere l'informazione: il proprietario deve capire cosa non ha funzionato.

# Regole
- Usa ESCLUSIVAMENTE quanto contenuto nella nota. Non inventare visitatori, cifre, date, caratteristiche dell'immobile o valutazioni di mercato.
- Se il prezzo non è stato discusso, imposta priceObservation a null anziché ipotizzare.
- Le azioni consigliate devono derivare dai feedback raccolti, non da consigli generici sulla vendita immobiliare.
- Nessuna promessa sui tempi di vendita né stime di valore che l'agente non ha espresso.
- Italiano impeccabile, forma di cortesia, tono professionale e rispettoso.
- Nel campo sellerMessage scrivi un testo pronto per WhatsApp: niente markdown, niente elenchi puntati, paragrafi brevi.`;

export class ReportGenerationError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_response" | "refused" | "upstream_error"
  ) {
    super(message);
    this.name = "ReportGenerationError";
  }
}

export async function generateSellerReport(params: {
  propertyRef: string;
  sellerName?: string;
  transcript: string;
}): Promise<VoiceReportContent> {
  const { propertyRef, sellerName, transcript } = params;

  const response = await client.messages
    .parse({
      model: REPORT_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "medium",
        format: zodOutputFormat(voiceReportSchema),
      },
      messages: [
        {
          role: "user",
          content: `Immobile: ${propertyRef}
${sellerName ? `Proprietario: ${sellerName}` : "Proprietario: non specificato"}

Nota post-visita dell'agente:
"""
${transcript}
"""

Genera il report per il proprietario secondo lo schema.`,
        },
      ],
    })
    .catch((error) => {
      console.error("[report-generator] Anthropic call failed", error);
      throw new ReportGenerationError(
        "Il servizio di generazione report non è al momento disponibile.",
        "upstream_error"
      );
    });

  if (response.stop_reason === "refusal") {
    throw new ReportGenerationError(
      "La nota non può essere elaborata per policy di sicurezza del modello.",
      "refused"
    );
  }

  if (!response.parsed_output) {
    throw new ReportGenerationError("Risposta AI non interpretabile.", "invalid_response");
  }

  return response.parsed_output;
}
