import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { auctionAppraisalSchema, type AuctionAppraisalResult } from "./auction-schema";

/**
 * Sintesi di una perizia giudiziaria.
 *
 * Stessa struttura di `document-extractor.ts` — stesso modello, stesso
 * trasporto del PDF come documento nativo, stesso `zodOutputFormat` — con
 * schema e prompt propri. Non è stato riusato quel file perché il suo prompt
 * è tarato su visure e atti: un solo prompt che debba coprire entrambi
 * finirebbe per servire male tutti e due.
 */

const APPRAISAL_MODEL = "claude-opus-5";

const APPRAISAL_PROMPT = `Analizza la perizia di stima allegata, redatta da un esperto nominato dal Tribunale nell'ambito di una procedura esecutiva immobiliare, ed estrai i dati richiesti dallo schema JSON.

# Dati personali: cosa NON riportare
La perizia contiene informazioni sul debitore esecutato e sui suoi familiari. Quelle persone non sono clienti dell'agenzia, non hanno acconsentito ad alcun trattamento, e la loro situazione è un dato giudiziario.
- NON riportare nomi, cognomi, codici fiscali, date di nascita o indirizzi di residenza di debitori, esecutati, occupanti o loro familiari, in NESSUN campo, nemmeno nella sintesi.
- NON riportare informazioni su condizioni di salute, situazione familiare, reddito o vicende personali.
- Quando devi riferirti a una persona, usa il ruolo: "l'esecutato", "l'occupante", "un terzo".
- L'unica eccezione sono i nomi di enti e uffici pubblici (Tribunale, Comune, Agenzia delle Entrate), che non sono dati personali.
- L'UBICAZIONE DEL BENE (via e civico dell'immobile all'asta) va invece riportata nel campo propertyAddress: e' gia' pubblicata nell'avviso di vendita del Tribunale. Non confonderla con la residenza dell'esecutato, che spesso e' un indirizzo diverso e non va mai riportata.

# Cosa devi riferire
Ti si chiede di dire COSA C'È SCRITTO nella perizia, non di valutarla.
- NON dire se il lotto conviene, se il prezzo è congruo, se il rischio è accettabile.
- NON consigliare azioni, non stimare probabilità di aggiudicazione.
- NON dedurre ciò che il perito non afferma: se la perizia tace sullo stato occupazionale, la risposta è NON_DETERMINATO, non "presumibilmente libero".
La valutazione del rischio la calcola il software da questi fatti, con criteri propri: un tuo giudizio qui non verrebbe usato e falserebbe quello vero.

# Stato occupazionale
- LIBERO: il perito accerta che l'immobile è libero da persone e cose.
- OCCUPATO_CON_TITOLO: occupato in forza di contratto (locazione, comodato) che il perito indica come opponibile alla procedura.
- OCCUPATO_SENZA_TITOLO: occupato in assenza di titolo, o con titolo che il perito indica come non opponibile.
- NON_DETERMINATO: la perizia non lo chiarisce, o il perito non ha potuto accedere.

# Difformità e vincoli
Riporta i fatti citando i valori e le espressioni della perizia. Se il perito scrive che una difformità non è sanabile, riportalo con quelle parole: è la distinzione che pesa di più.
Fra i gravami elenca ciò che RESTA a carico dell'aggiudicatario. Se la perizia precisa che un'iscrizione verrà cancellata con il decreto di trasferimento, non elencarla.

# Importi
In euro interi, senza separatori. Se il perito fornisce un intervallo di costo, usa i due estremi. Se non stima nulla, null: non inventare una cifra plausibile.

Se una sezione non è presente nel documento, lascia l'array vuoto o il campo null anziché forzare un contenuto.`;

// Come in `document-extractor.ts`: l'SDK legge da solo ANTHROPIC_API_KEY.
const client = new Anthropic();

export class AuctionAppraisalError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_response" | "refused" | "upstream_error" | "timeout"
  ) {
    super(message);
    this.name = "AuctionAppraisalError";
  }
}

export { APPRAISAL_MODEL };

/**
 * Legge la perizia e restituisce i fatti estratti.
 *
 * I messaggi d'errore sono scritti per l'agente e finiscono in scheda: dicono
 * cosa fare, non cosa è andato storto internamente. Su una perizia lunga la
 * causa più probabile è il tempo, ed è l'unico caso in cui c'è un rimedio che
 * dipende da lui — restringere le pagine — quindi va detto esplicitamente.
 */
export async function summariseAuctionAppraisal(
  pdfBase64: string
): Promise<AuctionAppraisalResult> {
  const response = await client.messages
    .parse({
      model: APPRAISAL_MODEL,
      max_tokens: 8192,
      output_config: {
        effort: "medium",
        format: zodOutputFormat(auctionAppraisalSchema),
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            },
            { type: "text", text: APPRAISAL_PROMPT },
          ],
        },
      ],
    })
    .catch((error: unknown) => {
      // `[RADAR-APPRAISAL-ERROR]`: una sola stringa da cercare nei log.
      const detail = error as { name?: string; message?: string; status?: number };
      console.error("[RADAR-APPRAISAL-ERROR]", {
        name: detail?.name,
        status: detail?.status,
        message: detail?.message,
      });

      throw new AuctionAppraisalError(
        "Il servizio di analisi non ha risposto. Riprova, oppure indica un intervallo di pagine più ristretto se la perizia è molto lunga.",
        "upstream_error"
      );
    });

  if (response.stop_reason === "refusal") {
    throw new AuctionAppraisalError(
      "Non possiamo elaborare questo documento.",
      "refused"
    );
  }

  if (!response.parsed_output) {
    throw new AuctionAppraisalError(
      "Non siamo riusciti a leggere la perizia. Se è protetta da password rimuovila; se è una scansione, verifica che sia leggibile.",
      "invalid_response"
    );
  }

  return response.parsed_output;
}
