import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  socialContentSchema,
  TONE_LABELS,
  type GenerationIntent,
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

/**
 * Cosa cambia fra i tre intenti.
 *
 * Non toccano MAI la regola che conta — usare solo cio' che e' scritto —
 * perche' e' quella che tiene l'annuncio dentro le norme sulla pubblicita'
 * immobiliare. Cambiano il registro e cosa mettere davanti, non i fatti.
 */
const INTENT_GUIDANCE: Record<GenerationIntent, string> = {
  social:
    "L'agente parte da un annuncio gia' scritto e vuole la versione per Facebook e Instagram: sintetizza, tieni le tre o quattro cose che fermano chi scorre, chiudi con un invito a scrivere in privato. Il post e' breve per scelta, non per fretta.",
  fsbo:
    "Il testo di partenza e' di un privato — Subito, Marketplace, un messaggio — quindi e' amatoriale: maiuscole sparse, abbreviazioni, entusiasmo generico, a volte errori. Riportalo al registro di un annuncio da portale professionale: struttura, terminologia corretta, niente esclamazioni. NON aggiungere dati che il privato non ha scritto, nemmeno quelli che 'di solito ci sono': se non dice la classe energetica, l'annuncio non la nomina.",
  rilancio:
    "L'annuncio e' fermo da tempo e va riproposto. Cambia l'attacco e l'ordine degli argomenti perche' non sembri lo stesso testo di prima, e metti davanti cio' che rende l'immobile interessante ADESSO. Se — e solo se — le note indicano un ribasso o una novita' concreta, quella va in evidenza: se non c'e', non inventarla e non alludere a sconti. Un ribasso annunciato e inesistente e' una pratica commerciale scorretta, non una trovata.",
};

function buildSystemPrompt(
  tone: SocialGenerationRequest["tone"],
  intent: GenerationIntent
): string {
  return `Sei un copywriter immobiliare italiano senior, specializzato in annunci per agenzie di fascia alta. Da poche note sintetiche generi tre formati distinti per lo stesso immobile, con il linguaggio di chi il settore lo vive ogni giorno — mai quello piatto e generico di una traduzione automatica.

# Tono di voce richiesto: ${TONE_LABELS[tone]}
${TONE_GUIDANCE[tone]}

# Cosa deve ottenere l'agente
${INTENT_GUIDANCE[intent]}

# Regole trasversali
- Scrivi in italiano impeccabile, senza calchi dall'inglese.
- Usa SOLO le informazioni presenti nelle note fornite. Non inventare metrature, prezzi, numero di locali, classe energetica o servizi non menzionati.
- Se un dato utile manca, ometti l'argomento invece di riempirlo con un'ipotesi.
- Niente affermazioni non verificabili ("il migliore della città", "occasione irripetibile").
- Rispetta le norme sulla pubblicità immobiliare: se il prezzo è indicato riportalo fedelmente, altrimenti non alluderne.

# Gergo tecnico e commerciale del settore
Un annuncio scritto da un'agenzia italiana suona diverso da una descrizione generica: usa la terminologia tecnica e catastale del mestiere ogni volta che le note la rendono pertinente — non aggiungerla se il dato corrispondente non c'è. Esempi del registro atteso (adattali al caso, non incollarli a memoria):
- Esposizione e luce: "doppia/tripla esposizione", "ottima luminosità", "esposizione Sud/Sud-Est".
- Piano e distribuzione: "ultimo piano", "piano alto con ascensore", "terrazzo al livello", "doppio ingresso", "zona giorno/notte separate".
- Impianti: "riscaldamento autonomo/centralizzato/termoautonomo", "climatizzato", "predisposizione domotica".
- Prestazioni ed economia: "classe energetica [X]", "spese condominiali contenute", "basso impatto energetico".
- Stato dell'immobile: "stato manutentivo ottimo/buono/da ristrutturare", "recentemente ristrutturato", "finiture di pregio", "da rivedere negli impianti".
  ATTENZIONE, questa riga e' quella su cui si sbaglia piu' spesso: "tenuto bene", "ben tenuto" o "in ottimo stato" NON significano "ristrutturato". Il primo descrive la manutenzione, il secondo afferma che sono stati fatti dei lavori — e' un fatto in piu', e se le note non lo dicono non va scritto. Vale allo stesso modo per "nuovo", "di recente costruzione" e "finiture di pregio": si usano solo se la fonte li afferma.
Questo registro serve a suonare competenti, non a riempire spazio: se le note non menzionano l'esposizione o gli impianti, non improvvisarli.

# Profilazione del target
Quando le caratteristiche descritte lo suggeriscono concretamente, indica a chi si rivolge l'immobile — è ciò che aiuta il potenziale acquirente a riconoscersi nell'annuncio invece di scorrerlo. La profilazione è una lettura dei fatti forniti, non un fatto nuovo: un trilocale con tre camere può dirsi adatto a "famiglie numerose"; un bilocale in zona universitaria o ben collegata a "giovani coppie" o "chi cerca la prima casa"; un immobile piccolo, ben locato o già affittato a un "investimento da mettere a reddito". Se le note non danno appigli per un profilo, ometti la profilazione invece di inventarne uno.

# Adattamento per canale
- ANNUNCIO PORTALI: registro informativo, struttura scansionabile, ottimizzato per la ricerca locale. Ripeti in modo naturale zona e tipologia, senza keyword stuffing. Il gergo tecnico va qui per esteso, in prosa.
- POST SOCIAL: discorsivo e visivo. Apri con una frase che cattura l'attenzione, poi elenca le caratteristiche chiave in un breve elenco puntato (3-5 righe, un dettaglio per riga: es. "🛋️ Doppia esposizione", "🌳 Terrazzo abitabile", "🔥 Riscaldamento autonomo") prima di chiudere con un paragrafo discorsivo e la call to action. Emoji contestuali e misurate — non più di una ogni due righe, mai decorative senza motivo — e mai nel corpo dell'annuncio portali.
- SCRIPT REEL: pensato per essere girato con uno smartphone dall'agente. L'hook dei primi 3 secondi deve essere un gancio visivo concreto (cosa inquadrare, non solo cosa dire) che crei curiosità immediata — non un'introduzione generica ("Vi presento questo immobile"). Ogni scena ha un'indicazione di ripresa realizzabile da una persona sola. La call to action finale deve dare un'istruzione precisa e immediata (es. "Scrivici in DM per prenotare la visita", "Link in bio per tutti i dettagli"), mai un generico "contattaci". Il totale deve stare in circa 30 secondi di parlato.`;
}

/**
 * Compone il brief a partire dalla sorgente disponibile.
 *
 * Con i campi compilati si passa il brief già strutturato dall'agente. Col
 * solo testo incollato si passa quello, dicendo al modello che deve prima
 * ricavarne i dati: il vincolo del prompt di sistema — usare esclusivamente
 * ciò che è scritto — vale identico nei due casi, quindi non serve un
 * passaggio intermedio di estrazione per ottenere lo stesso rigore.
 *
 * Se ci sono entrambi vince il brief strutturato, ma il testo resta allegato
 * come contesto: l'agente che ha corretto i campi si aspetta che le sue
 * correzioni prevalgano, non che vengano riscritte dall'originale.
 */
function buildUserMessage(input: SocialGenerationRequest): string {
  const hasFields =
    (input.propertyTitle?.length ?? 0) >= 3 && (input.keyPoints?.length ?? 0) >= 10;

  /*
   * L'istruzione dell'agente, in coda e marcata come tale.
   *
   * In coda perche' arrivi dopo i fatti: e' un'indicazione su COME scrivere,
   * non una fonte da cui ricavare dati. La riga finale lo dice al modello in
   * modo esplicito — senza, "scrivi che ha il giardino" verrebbe letto come
   * un fatto nuovo invece che come una richiesta a cui rispondere di no.
   */
  const istruzione = input.freePrompt?.trim()
    ? `\n\nIstruzione dell'agente su come scriverlo:\n"""\n${input.freePrompt.trim()}\n"""\nSeguila per registro, taglio e lunghezza. Non puo' pero' aggiungere fatti: se chiede di citare una caratteristica che le note non contengono, ignora quella parte e prosegui col resto.`
    : "";

  if (hasFields) {
    const context = input.rawText
      ? `\n\nTesto originale dell'annuncio, come contesto aggiuntivo. In caso di divergenza prevalgono i punti chiave qui sopra, che l'agente ha rivisto:\n"""\n${input.rawText}\n"""`
      : "";

    return `Immobile: ${input.propertyTitle}

Punti chiave forniti dall'agente:
${input.keyPoints}${context}${istruzione}

Genera i tre formati richiesti dallo schema.`;
  }

  /*
   * L'istruzione da sola, senza note ne' testo incollato.
   *
   * E' la terza scheda: l'agente scrive cosa vuole e basta. Qui la regola
   * "usa solo cio' che e' scritto" non cambia — cambia dove sta lo scritto,
   * che e' l'istruzione stessa. Va detto al modello, o cercherebbe delle note
   * che non esistono e produrrebbe un testo generico su un immobile inventato.
   */
  if (!input.rawText?.trim() && input.freePrompt?.trim()) {
    return `L'agente non ha allegato note ne' un annuncio: l'unica fonte e' la sua istruzione.

Istruzione:
"""
${input.freePrompt.trim()}
"""

Genera i tre formati richiesti dallo schema usando i soli elementi che l'istruzione contiene. Se non nomina prezzo, metratura o classe energetica, non inventarli: scrivi un testo che funzioni senza quei dati.`;
  }

  return `Testo grezzo dell'annuncio, incollato dall'agente da un portale, un gestionale o un'email:
"""
${input.rawText ?? ""}
"""

Ricavane i dati dell'immobile — ignorando menu, banner e riferimenti ad altri immobili — e genera i tre formati richiesti dallo schema. Vale la regola di sempre: usa solo ciò che è scritto, senza colmare i vuoti con ipotesi.${istruzione}`;
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
      system: buildSystemPrompt(input.tone, input.intent ?? "social"),
      output_config: {
        effort: "medium",
        format: zodOutputFormat(socialContentSchema),
      },
      messages: [
        {
          role: "user",
          content: buildUserMessage(input),
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
