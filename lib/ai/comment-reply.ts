import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { reportAiError } from "@/lib/observability/report-error";

/**
 * Bozza di risposta a un commento Instagram o Facebook.
 *
 * # Perché è una bozza e non un invio
 *
 * Il testo torna all'agente, che lo legge, lo corregge e decide se
 * pubblicarlo. Un commento sotto un post è pubblico, resta a nome
 * dell'agenzia e non si richiama prima che qualcuno lo legga: la revisione
 * umana non è una cautela in più, è la funzione.
 *
 * # Il registro: "lei", anche se il commento dà del tu
 *
 * Qui non parla PropertyTech al proprio utente, parla l'agenzia a una persona
 * che non conosce e che si è appena affacciata su un annuncio. È la norma del
 * settore immobiliare italiano (CLAUDE.md §1) e vale anche quando il commento
 * arriva in tono confidenziale: chi scrive "quanto costa?" sotto un post non
 * ha autorizzato nessuno a dargli del tu a nome di un'azienda.
 */

const client = new Anthropic();

/**
 * Lo stesso modello della conversazione WhatsApp, non quello del supporto.
 *
 * Quello che esce di qui finisce sotto un post pubblico, a nome dell'agenzia,
 * e ci resta: è testo rivolto a un cliente, non una risposta interna, e segue
 * la scelta fatta per gli altri testi che escono dall'agenzia.
 */
const MODELLO = "claude-opus-5";

/** Una risposta a un commento è corta per natura: il tetto evita il papiro. */
const MAX_TOKEN = 300;

export interface RichiestaRisposta {
  /** Dove è stato scritto: cambia il registro, non le regole. */
  piattaforma: "instagram" | "facebook";
  /** Il commento a cui si risponde. */
  commento: string;
  /** Chi l'ha scritto, per poterlo nominare. */
  autore: string;
  /** La didascalia del post: è il contesto di cosa si sta commentando. */
  didascalia?: string | null;
  /** Nome dell'agenzia, per firmarsi come tale. */
  agenzia: string;
}

function systemPrompt(piattaforma: RichiestaRisposta["piattaforma"]): string {
  const dove =
    piattaforma === "facebook"
      ? "sotto un post della Pagina Facebook dell'agenzia"
      : "sotto un post Instagram dell'agenzia";

  return `Sei l'addetto social di un'agenzia immobiliare italiana. Scrivi la risposta a un commento ricevuto ${dove}.

# Registro
- Dai del **lei**, sempre, anche se il commento dà del tu: parla l'agenzia a una persona che non conosce.
- Tono cordiale e professionale, mai servile e mai promozionale.
- Da una a tre frasi. Una risposta lunga sotto un post non la legge nessuno.
- Italiano corretto, punteggiatura da tastiera italiana. Mai il trattino lungo come inciso: usa virgole, parentesi tonde o punti.
- Niente emoji a raffica: al massimo una, solo se il commento è a sua volta informale.

# Cosa puoi dire, e cosa no
- Usa SOLO quello che c'è nel commento e nella didascalia del post. Non inventare prezzo, metratura, piano, spese, classe energetica o disponibilità di visite.
- Se chiedono un dato che non hai, non dire che non lo sai e basta: invita a scrivere in privato o a lasciare un contatto, che è il passo che fa proseguire la conversazione.
- Non promettere che l'immobile è ancora disponibile, non fissare appuntamenti, non confermare trattative.
- Non chiedere dati personali nel commento pubblico (telefono, email, indirizzo): quelli si raccolgono in privato. Chiedere un numero di telefono sotto un post espone chi risponde.

# Casi particolari
- Commento polemico o critico: rispondi con misura, senza difenderti punto per punto, e sposta il confronto in privato.
- Commento offensivo o spam: restituisci una risposta breve e neutra, senza raccogliere la provocazione.
- Complimento senza domanda: ringrazia in una riga, senza attaccare una proposta commerciale.

Rispondi **solo** con il testo della risposta, senza virgolette, senza firma e senza prefissi come "Risposta:".`;
}

export async function generaRispostaCommento(
  richiesta: RichiestaRisposta
): Promise<{ ok: true; testo: string } | { ok: false; errore: string }> {
  const didascalia = richiesta.didascalia?.trim();

  const contesto = [
    `Agenzia: ${richiesta.agenzia}`,
    didascalia
      ? `Didascalia del post:\n"""\n${didascalia.slice(0, 1500)}\n"""`
      : "Didascalia del post: non disponibile.",
    `Piattaforma: ${richiesta.piattaforma === "facebook" ? "Facebook" : "Instagram"}`,
    `Commento di ${richiesta.piattaforma === "facebook" ? "" : "@"}${richiesta.autore}:\n"""\n${richiesta.commento.slice(0, 1000)}\n"""`,
  ].join("\n\n");

  try {
    const risposta = await client.messages.create({
      model: MODELLO,
      max_tokens: MAX_TOKEN,
      system: systemPrompt(richiesta.piattaforma),
      messages: [{ role: "user", content: contesto }],
    });

    const testo = risposta.content
      .filter((blocco): blocco is Anthropic.TextBlock => blocco.type === "text")
      .map((blocco) => blocco.text)
      .join("\n")
      .trim();

    if (!testo) {
      return { ok: false, errore: "Non sono riuscito a scrivere una bozza. Riprova." };
    }

    return { ok: true, testo };
  } catch (error) {
    reportAiError(error, "social/comment-reply");
    return {
      ok: false,
      errore: "L'AI non è raggiungibile in questo momento. Puoi scrivere la risposta a mano.",
    };
  }
}
