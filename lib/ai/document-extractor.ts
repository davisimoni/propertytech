import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { documentExtractionSchema, type DocumentExtractionResult } from "./document-schema";

const client = new Anthropic();

const EXTRACTION_MODEL = "claude-opus-5";

const EXTRACTION_PROMPT = `Analizza il documento immobiliare allegato ed estrai i dati richiesti dallo schema JSON fornito. Può essere una visura catastale, una planimetria, un atto di provenienza, un APE, un'ispezione ipotecaria, un titolo edilizio (CILA, SCIA, permesso di costruire) o un verbale condominiale.

# Tre piani distinti, da non confondere
- CATASTO: identifica e censisce l'immobile (foglio, particella, subalterno, categoria, classe, consistenza, rendita, superficie catastale, intestatari).
- SITUAZIONE GIURIDICA (Conservatoria): cosa risulta pubblicizzato nei registri immobiliari — provenienza, trascrizioni, ipoteche, pignoramenti.
- URBANISTICA/EDILIZIA: coerenza con i titoli edilizi — CILA, SCIA, permesso di costruire, sanatorie, condoni, agibilità.
Un immobile può essere in regola su un piano e non sull'altro. Compila solo le sezioni che il documento contiene davvero: da una visura non arrivano titoli edilizi, da una CILA non arrivano intestatari.

# Precisioni terminologiche
- La CLASSE catastale è un parametro reddituale interno alla categoria, non un voto di qualità.
- La CONSISTENZA in vani non corrisponde al numero di stanze fisiche.
- La RENDITA catastale è un valore fiscale: non è il prezzo né il valore di mercato.
- La SUPERFICIE CATASTALE non coincide necessariamente con quella commerciale, che segue criteri diversi.
- I MILLESIMI sono una frazione su 1000, non una percentuale di proprietà dell'edificio.
- Il DIRITTO REALE va letto, non dedotto: distingui proprietà, nuda proprietà e usufrutto, perché determinano chi può disporre del bene.

# Pertinenze
Garage, cantine e posti auto sono di norma subalterni distinti sulla stessa particella. Se il documento ne riporta, elencali in "pertinenze" anziché confonderli con l'unità principale.

# Criticità
In "criticita" segnala ciò che merita attenzione: incongruenze fra dati (superficie catastale diversa da quella dichiarata, intestatari catastali diversi dai soggetti dell'atto), ipoteche, pignoramenti, domande giudiziali, sanatorie, condoni, assenza di agibilità, diritti reali che limitano la vendita.
Descrivi il FATTO rilevato citando i valori del documento. NON esprimere valutazioni legali, non concludere se l'immobile sia vendibile o commerciabile, non consigliare azioni legali: quella è responsabilità del professionista, e un giudizio sbagliato qui costerebbe caro all'agenzia. Se non emerge nulla, lascia l'array vuoto anziché forzare un rilievo.

# Regole generali
- Usa null per qualsiasi campo non presente o non leggibile — non inventare dati.
- Gli array restano vuoti quando il documento non contiene quella categoria di informazioni.
- Scrivi in italiano.
- "sintesiAgente" è la prima cosa che l'agente legge: deve essere trasparente sui limiti dell'estrazione. Se un dato è illeggibile o assente dillo esplicitamente, così l'agente sa cosa verificare a mano.`;

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
