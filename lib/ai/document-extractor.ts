import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { documentExtractionSchema, type DocumentExtractionResult } from "./document-schema";

const client = new Anthropic();

const EXTRACTION_MODEL = "claude-opus-5";

const EXTRACTION_PROMPT = `Analizza il documento immobiliare allegato (Visura Catastale, Planimetria, Atto di Provenienza o APE) ed estrai i dati richiesti dallo schema JSON fornito.

Regole:
- Usa null per qualsiasi campo non presente o non leggibile nel documento — non inventare dati.
- L'elenco "proprietari" deve contenere una voce per ciascun intestatario individuato nel documento.
- Traduci in italiano eventuali sintesi testuali (es. in "noteVincoli").
- "sintesiAgente" è la prima cosa che l'agente legge: deve essere trasparente sui limiti dell'estrazione. Se un dato è illeggibile o assente dillo esplicitamente invece di ometterlo, così l'agente sa cosa verificare a mano.`;

export class DocumentExtractionError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_response" | "refused" | "upstream_error"
  ) {
    super(message);
    this.name = "DocumentExtractionError";
  }
}

export async function extractDocumentData(pdfBase64: string): Promise<DocumentExtractionResult> {
  const response = await client.messages
    .parse({
      model: EXTRACTION_MODEL,
      max_tokens: 8192,
      output_config: {
        effort: "medium",
        format: zodOutputFormat(documentExtractionSchema),
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    })
    .catch((error) => {
      console.error("[document-extractor] Anthropic API call failed", error);
      throw new DocumentExtractionError(
        "Il servizio di analisi non risponde in questo momento. Riprova fra qualche minuto: il credito non è stato consumato.",
        "upstream_error"
      );
    });

  if (response.stop_reason === "refusal") {
    throw new DocumentExtractionError(
      "Non possiamo elaborare questo documento. Se contiene dati particolarmente sensibili, prova a caricare solo le pagine con i dati catastali.",
      "refused"
    );
  }

  if (!response.parsed_output) {
    throw new DocumentExtractionError(
      // Il caso tipico non è un guasto: è un PDF protetto da password o una
        // scansione illeggibile. Dirlo evita che l'agente ricarichi dieci volte
        // lo stesso file aspettandosi un esito diverso.
        "Non siamo riusciti a leggere il documento. Se è protetto da password, rimuovila e riprova; se è una scansione, verifica che sia dritta e leggibile.",
      "invalid_response"
    );
  }

  return response.parsed_output;
}
