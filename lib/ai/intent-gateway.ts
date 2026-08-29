import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * Filtro di pertinenza davanti all'agente di qualificazione.
 *
 * # Perché serve
 *
 * Il numero WhatsApp dell'agenzia è lo stesso che usano fornitori, colleghi e
 * conoscenti. Senza un filtro, l'assistente risponde all'idraulico che chiede
 * quando passare e al cognato che organizza una cena, chiedendo a entrambi se
 * hanno la delibera del mutuo.
 *
 * # Perché un modello piccolo
 *
 * È una decisione binaria che sta davanti a **ogni** messaggio in arrivo:
 * pagare Opus per dire "sì, parla di case" sarebbe sproporzionato, e la
 * latenza si somma a quella della risposta vera. Haiku decide questo bene e in
 * una frazione del tempo.
 *
 * # L'asimmetria che governa tutto il modulo
 *
 * I due errori possibili non costano uguale.
 *
 * Un falso "fuori contesto" fa **tacere l'assistente davanti a un cliente
 * vero**: il lead resta senza risposta, l'agenzia non se ne accorge, e quel
 * contatto è perso senza lasciare traccia. Un falso "pertinente" fa al massimo
 * rispondere l'assistente a un messaggio che non lo riguardava — sgradevole,
 * ma visibile e recuperabile.
 *
 * Da qui due conseguenze scritte nel codice: il prompt richiede una certezza
 * esplicita per scartare, e **qualunque guasto del filtro lascia passare il
 * messaggio**. Se il classificatore non risponde, si qualifica.
 */

const client = new Anthropic();

/** Haiku: classificazione binaria, non generazione. */
const GATEWAY_MODEL = "claude-haiku-4-5-20251001";

const intentSchema = z.object({
  pertinente: z
    .boolean()
    .describe(
      "true se il messaggio può riguardare l'attività di un'agenzia immobiliare; false SOLO se è palesemente estraneo."
    ),
  motivo: z
    .string()
    .describe("Categoria in due o tre parole, per i log. Es. 'saluto iniziale', 'pubblicità'."),
});

export type IntentVerdict = z.infer<typeof intentSchema>;

const SYSTEM_PROMPT = `Sei un filtro di smistamento per il numero WhatsApp di un'agenzia immobiliare italiana. Decidi se un messaggio in arrivo riguarda l'attività dell'agenzia.

# È PERTINENTE (pertinente: true)
- Richieste su immobili: comprare, vendere, affittare, visitare, prezzi, metrature, zone.
- Mutui, finanziamenti, spese, rogito, caparra, proposte d'acquisto.
- Appuntamenti, visite, disponibilità, conferme o disdette.
- Domande di servizio sull'agenzia: dove siete, orari, come contattarvi.
- Risposte a domande che l'agenzia ha appena posto, anche brevissime ("sì", "no", "3 mesi", "200 mila", "va bene giovedì").
- **Saluti e aperture generiche**: "Buongiorno", "Salve", "C'è qualcuno?", "Ho visto l'annuncio". Chi scrive a un'agenzia sta quasi sempre per chiedere di una casa: NON è fuori contesto.
- Qualsiasi messaggio ambiguo, incompleto o che non capisci.

# NON È PERTINENTE (pertinente: false)
Solo quando è **evidente** che non c'entra nulla:
- Conversazioni personali fra conoscenti: cene, famiglia, salute, vacanze, auguri.
- Fornitori e colleghi su altro: consegne, fatture, turni, materiali.
- Pubblicità, catene, truffe, phishing, messaggi automatici di altri servizi.
- Numeri sbagliati dichiarati ("scusi ho sbagliato numero").
- Contenuti offensivi o provocatori senza alcuna richiesta.

# La regola che vince su tutte
Nel dubbio, pertinente: true.
Sbagliare qui significa lasciare senza risposta una persona che voleva comprare casa, e nessuno se ne accorgerà. Scarta solo ciò di cui sei certo.`;

/**
 * Decide se vale la pena far intervenire l'assistente.
 *
 * Non lancia mai: in caso di guasto restituisce `pertinente: true`. È la scelta
 * conservativa — meglio una risposta di troppo che il silenzio su un lead vero.
 */
export async function classifyIntent(params: {
  message: string;
  /** Ultimi scambi, per capire se è la risposta a una domanda dell'assistente. */
  recentContext?: string[];
}): Promise<IntentVerdict> {
  const contesto = params.recentContext?.length
    ? `Ultimi messaggi della conversazione (dal meno al più recente):\n${params.recentContext.join("\n")}\n\n`
    : "";

  try {
    const response = await client.messages.parse({
      model: GATEWAY_MODEL,
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      output_config: { format: zodOutputFormat(intentSchema) },
      messages: [
        {
          role: "user",
          content: `${contesto}Messaggio da valutare:\n"""${params.message}"""`,
        },
      ],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return { pertinente: true, motivo: "classificazione non disponibile" };
    }

    return response.parsed_output;
  } catch (error) {
    console.error("[intent-gateway] Classificazione non riuscita", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return { pertinente: true, motivo: "errore del filtro" };
  }
}
