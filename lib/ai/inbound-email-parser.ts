import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { reportAiError } from "@/lib/observability/report-error";

/**
 * Ripiego del parser email, quando le regole non riconoscono il formato.
 *
 * # Perché non è il percorso principale
 *
 * Perché sulle email dei tre portali italiani le regole vincono su tutta la
 * linea: costano zero, rispondono in un millisecondo e su una forma fissa non
 * sbagliano mai. Il modello entra in gioco **solo** dove quelle tornano a mani
 * vuote — un portale straniero, il modulo di un sito scritto in prosa — cioè
 * esattamente i casi che prima si perdevano in silenzio.
 *
 * # Perché un modello piccolo
 *
 * Perché il compito è copiare quattro campi da un testo corto, non ragionare.
 * Haiku costa una frazione e risponde prima; su questo percorso il tempo conta,
 * perché a valle c'è un messaggio WhatsApp che dovrebbe partire "in pochi
 * secondi".
 */

const MODELLO = "claude-haiku-4-5";

/**
 * Timeout corto e un solo tentativo.
 *
 * Questo codice gira dentro il webhook dell'email, che ha un tetto di 60
 * secondi condiviso con la creazione del lead e l'invio del primo messaggio.
 * Meglio rinunciare al ripiego — e avvisare l'agenzia, che è il passo
 * successivo — che far scadere l'intera richiesta.
 */
const TIMEOUT_MS = 15_000;

const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });

const schema = z.object({
  nome: z
    .string()
    .describe(
      "Nome e cognome di chi scrive. Stringa VUOTA se non compare: non dedurlo dall'indirizzo email."
    ),
  telefono: z
    .string()
    .describe(
      "Recapito telefonico di chi scrive, con il prefisso internazionale se presente. Stringa VUOTA se non compare. NON usare mai una partita IVA, un codice fiscale, un codice annuncio o il numero dell'agenzia che riceve."
    ),
  riferimento_immobile: z
    .string()
    .describe(
      "Codice, titolo o indirizzo dell'immobile richiesto, come scritto. Stringa VUOTA se non compare."
    ),
  messaggio: z
    .string()
    .describe("Il testo scritto dal richiedente, senza firme né piè di pagina. Stringa VUOTA se non c'è."),
});

export interface LeadDaEmailAI {
  nome: string | null;
  telefono: string;
  riferimentoImmobile: string | null;
  messaggio: string | null;
}

const PROMPT = `Questa è una richiesta di informazioni su un immobile, arrivata per email da un portale immobiliare o dal modulo di un sito. Estrai i dati di CHI SCRIVE secondo lo schema.

# Da chi sono i dati
Il contatto da estrarre è quello del potenziale cliente che chiede informazioni, MAI quello dell'agenzia che riceve l'email né quello del portale che la inoltra. Firme, piè di pagina, "inviato da", partite IVA e recapiti dell'agenzia vanno ignorati.

# Sul telefono
Riportalo come compare, comprensivo di prefisso internazionale se c'è. Se nell'email non c'è un recapito telefonico del richiedente, lascia la stringa vuota: inventarlo o ricavarlo da un altro numero presente nel testo manderebbe un messaggio a uno sconosciuto.

# Regola generale
Non dedurre, non completare, non tradurre. Se un campo non c'è, stringa vuota.`;

/**
 * Legge una email che le regole non hanno riconosciuto.
 *
 * Torna `null` quando non c'è un telefono utilizzabile: senza recapito non
 * nasce nessun lead, che è la stessa regola del parser a regole. Non lancia
 * mai — è un ripiego, e un suo guasto non deve rompere il webhook.
 */
export async function estraiLeadDaEmail(params: {
  subject: string;
  text: string;
}): Promise<LeadDaEmailAI | null> {
  const corpo = `${params.subject}\n\n${params.text}`.slice(0, 12_000);

  try {
    const response = await client.messages.parse({
      model: MODELLO,
      max_tokens: 1024,
      // Niente `effort`: su Haiku non è supportato e la chiamata verrebbe
      // rifiutata. Qui non servirebbe comunque — è una copiatura di campi.
      output_config: { format: zodOutputFormat(schema) },
      messages: [{ role: "user", content: `${PROMPT}\n\n---\n${corpo}` }],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) return null;

    const dati = response.parsed_output;
    const telefono = dati.telefono.trim();
    if (!telefono) return null;

    return {
      nome: dati.nome.trim() || null,
      telefono,
      riferimentoImmobile: dati.riferimento_immobile.trim() || null,
      messaggio: dati.messaggio.trim() || null,
    };
  } catch (error) {
    reportAiError(error, "inbound-email-parser");
    console.error("[inbound-email-parser] Ripiego AI non riuscito", error);
    return null;
  }
}
