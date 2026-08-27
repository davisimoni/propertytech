import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ChatMessage } from "@/lib/whatsapp/types";
import { PRIVACY_DISCLOSURE } from "@/lib/whatsapp/compliance";

const client = new Anthropic();

const AGENT_MODEL = "claude-opus-5";

export { QUALIFICATION_QUESTIONS } from "@/lib/whatsapp/questions";

export const agentReplySchema = z.object({
  reply: z
    .string()
    .describe(
      "Il messaggio WhatsApp da inviare al cliente, in italiano impeccabile, massimo 2-3 frasi brevi."
    ),
  mortgageApproved: z
    .boolean()
    .nullable()
    .describe(
      "true se il cliente ha delibera del mutuo OPPURE liquidità immediata; false se non ha ancora copertura finanziaria; null se non ancora emerso dalla conversazione."
    ),
  mustSellFirst: z
    .boolean()
    .nullable()
    .describe(
      "true se il cliente deve vendere un altro immobile prima di acquistare; false se non deve farlo; null se non ancora emerso."
    ),
  timeframe: z
    .string()
    .nullable()
    .describe(
      "Tempistica di acquisto dichiarata dal cliente, sintetizzata (es. 'entro 3 mesi', 'oltre 12 mesi'); null se non ancora emersa."
    ),
  budget: z
    .string()
    .nullable()
    .describe("Budget dichiarato dal cliente, se menzionato spontaneamente; altrimenti null."),
  /**
   * Zona di interesse. Come il budget, si **raccoglie** se il cliente la
   * nomina — non si chiede: le domande restano tre, e aggiungerne una quarta
   * allungherebbe la qualificazione proprio dove il tasso di abbandono è più
   * alto. Serve allo Smart Match, che finora funzionava solo sui lead
   * importati da CSV: quelli arrivati da WhatsApp non avevano mai una zona,
   * quindi non venivano mai abbinati a un immobile in portafoglio.
   */
  preferredZone: z
    .string()
    .nullable()
    .describe(
      "Zona, quartiere o comune che il cliente dice di cercare, se lo menziona spontaneamente (es. 'Navigli', 'zona centro'). NON chiederlo: null se non emerge da solo."
    ),
  outcome: z
    .enum(["CONTINUE", "QUALIFIED", "UNQUALIFIED"])
    .describe(
      "CONTINUE se mancano ancora risposte alle 3 domande; QUALIFIED o UNQUALIFIED solo quando tutte e 3 le variabili sono note."
    ),
  selectedSlotIndex: z
    .number()
    .int()
    .nullable()
    .describe(
      "Indice (a partire da 1) dello slot appena scelto dal cliente fra quelli proposti; null se non ha ancora scelto o se non erano stati proposti slot."
    ),
});

export type AgentReply = z.infer<typeof agentReplySchema>;

export class WhatsAppAgentError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_response" | "refused" | "upstream_error"
  ) {
    super(message);
    this.name = "WhatsAppAgentError";
  }
}

function buildSlotSection(availableSlots: string[]): string {
  if (availableSlots.length === 0) {
    return `# Agenda
Non ci sono slot liberi in agenda. Se il cliente risulta QUALIFIED, digli che un agente lo contatterà a breve con le disponibilità per la visita. Non inventare mai date o orari.`;
  }

  const list = availableSlots.map((slot, index) => `${index + 1}. ${slot}`).join("\n");

  return `# Agenda — slot liberi per la visita
${list}

Se il cliente risulta QUALIFIED, proponi ESATTAMENTE questi slot con questa numerazione e chiedigli quale preferisce. Non inventare né modificare date, orari o nomi degli agenti: usa solo ciò che è elencato qui.
Quando il cliente indica quale slot preferisce (es. "il primo", "giovedì", "va bene il 2"), imposta selectedSlotIndex al numero corrispondente e conferma l'appuntamento nel messaggio. Se la sua scelta è ambigua, lascia selectedSlotIndex a null e chiedi conferma.`;
}

function buildSystemPrompt(
  agencyName: string,
  propertyRef: string,
  clientName: string,
  availableSlots: string[]
): string {
  return `Sei l'assistente virtuale dell'agenzia immobiliare italiana "${agencyName}". Stai qualificando via WhatsApp il potenziale acquirente ${clientName}, che ha richiesto informazioni sull'immobile "${propertyRef}" tramite un portale immobiliare.

# Tono
Professionale, empatico, sintetico. Italiano impeccabile, forma di cortesia ("lei"). Massimo 2-3 frasi brevi per messaggio: stai scrivendo su WhatsApp, non via email. Niente elenchi puntati, niente emoji, niente formattazione markdown.

# Obiettivo
Raccogliere le risposte a queste 3 domande, una alla volta, in modo fluido e conversazionale:
1. MUTUO/CAPITALE: ha la delibera del mutuo o liquidità immediata?
2. VENDITA: deve prima vendere un altro immobile?
3. TEMPISTICA: entro quando desidera concludere l'acquisto?

Poni UNA sola domanda per messaggio. Riconosci brevemente la risposta ricevuta prima di passare alla successiva. Se il cliente risponde in modo ambiguo, chiedi un chiarimento sulla stessa domanda invece di procedere. Se il cliente fa una domanda sull'immobile, rispondi che un agente fornirà i dettagli e riporta la conversazione sulla qualificazione.

# Criterio di qualificazione (applicalo solo quando conosci tutte e 3 le variabili)
QUALIFIED se: (mutuo deliberato OPPURE liquidità immediata) E (non deve vendere prima, oppure la vendita non è vincolante) E (acquisto entro 6 mesi).
UNQUALIFIED in tutti gli altri casi.

# Messaggio finale
- Se QUALIFIED: ringrazia e proponi di fissare una visita seguendo la sezione Agenda qui sotto.
- Se UNQUALIFIED: ringrazia cordialmente, spiega che un agente lo ricontatterà appena disponibile. Non dire mai che non è idoneo o che non è qualificato.
- Se CONTINUE: il messaggio deve contenere la domanda successiva.

${buildSlotSection(availableSlots)}

# Vincoli
- Non inventare mai dettagli sull'immobile (prezzo, metratura, disponibilità): non li conosci.
- Non ripetere l'informativa privacy: è già stata inviata nel primo messaggio.
- Imposta le variabili strutturate a null finché la relativa risposta non è chiaramente emersa: non dedurle.`;
}

/**
 * Genera la risposta dell'agente ed estrae le variabili di qualificazione in
 * un'unica chiamata: la stessa analisi che decide cosa scrivere produce anche
 * i campi strutturati, evitando che testo e stato del lead divergano.
 */
export async function generateAgentReply(params: {
  agencyName: string;
  clientName: string;
  propertyRef: string;
  history: ChatMessage[];
  availableSlots: string[];
}): Promise<AgentReply> {
  const { agencyName, clientName, propertyRef, history, availableSlots } = params;

  const response = await client.messages
    .parse({
      model: AGENT_MODEL,
      max_tokens: 2048,
      system: buildSystemPrompt(agencyName, propertyRef, clientName, availableSlots),
      output_config: {
        effort: "low",
        format: zodOutputFormat(agentReplySchema),
      },
      messages: history.map((message) => ({
        role: message.sender === "bot" ? ("assistant" as const) : ("user" as const),
        content: message.text,
      })),
    })
    .catch((error) => {
      console.error("[whatsapp-agent] Anthropic call failed", error);
      throw new WhatsAppAgentError("Servizio AI non disponibile.", "upstream_error");
    });

  if (response.stop_reason === "refusal") {
    throw new WhatsAppAgentError("Richiesta rifiutata dal modello.", "refused");
  }

  if (!response.parsed_output) {
    throw new WhatsAppAgentError("Risposta AI non interpretabile.", "invalid_response");
  }

  return response.parsed_output;
}

/** Messaggio di fallback se l'AI non è raggiungibile: mai lasciare il cliente senza risposta. */
export const AGENT_FALLBACK_MESSAGE =
  "Grazie per il suo messaggio. Un nostro agente la ricontatterà al più presto per fornirle tutti i dettagli.";

export { PRIVACY_DISCLOSURE };
