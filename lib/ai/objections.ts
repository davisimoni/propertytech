import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { reportAiError } from "@/lib/observability/report-error";
import {
  MAX_OBIEZIONI,
  MIN_OBIEZIONI,
  objectionsSchema,
  type ContestoImmobile,
  type Objection,
} from "./objections-schema";

/**
 * Le obiezioni che riceverà *questo* immobile, con la risposta pronta.
 *
 * # Perché qui serve il modello e negli script no
 *
 * Gli otto script dell'acquisizione sono frasi scritte una volta: cambiano
 * solo nome e numeri, e farle generare costerebbe attesa per avere ogni volta
 * un testo leggermente diverso. Qui è il contrario: "classe energetica G in un
 * condominio senza ascensore a 320.000 €" produce obiezioni che nessun elenco
 * fisso può contenere, perché dipendono dalla combinazione dei dati.
 *
 * # La regola che tiene insieme tutto: solo ciò che è scritto
 *
 * Il modello non deve dedurre difetti plausibili. Un immobile senza classe
 * energetica indicata non è "probabilmente una G", e un piano non dichiarato
 * non diventa "senza ascensore". Un'obiezione inventata manda l'agente a
 * giustificarsi di un problema che l'immobile non ha, davanti a un cliente che
 * non l'aveva sollevato: è il modo più rapido di crearlo.
 */

const client = new Anthropic();

/**
 * Lo stesso modello degli altri testi che escono verso i clienti.
 *
 * Gli script finiscono su WhatsApp a nome dell'agenzia: è la stessa scelta
 * fatta per la conversazione WhatsApp e per le risposte ai commenti.
 */
const MODELLO = "claude-opus-5";

const SYSTEM = `Sei un formatore di agenti immobiliari italiani, specializzato nella gestione delle obiezioni in trattativa. Dato un immobile, prevedi le obiezioni che riceverà da chi lo visita o ne chiede informazioni, e per ciascuna scrivi la risposta pronta.

# Chi parla e a chi
- L'**obiezione** è nelle parole del cliente: come la direbbe davvero, non come la riassumerebbe un manuale. Va dal tu o dal lei a seconda di come parlerebbe una persona normale.
- Lo **script** è il messaggio WhatsApp che l'agenzia invia al cliente: **dai sempre del lei**. È l'agenzia che scrive a una persona che non conosce.
- La **strategia** è per l'agente: spiega in due o tre frasi perché quella risposta funziona e cosa fare se il cliente insiste. Qui puoi dare del tu all'agente.

# Regole sulle obiezioni
- Da ${MIN_OBIEZIONI} a ${MAX_OBIEZIONI}, ordinate dalla più probabile.
- **Ricavale SOLO dai dati forniti.** Se la classe energetica non è indicata, non esiste un'obiezione sulla classe energetica. Se il piano non è indicato, non parlare di ascensore. Non dedurre difetti "tipici" della zona, dell'epoca di costruzione o della tipologia.
- Ogni obiezione deve poggiare su un dato concreto: il prezzo, la metratura, la classe energetica, lo stato, una criticità che l'agente ha scritto. Se i dati bastano per due sole obiezioni fondate, scrivine due e basta: meglio poche e vere.
- Niente obiezioni generiche ("ci devo pensare", "sento mia moglie") a meno che i dati non le rendano specifiche di questo immobile: quelle l'agente le ha già altrove.

# Regole sugli script
- Da tre a sei righe. Su WhatsApp un messaggio lungo non si legge.
- Italiano corretto, punteggiatura da tastiera italiana. Mai il trattino lungo come inciso: usa virgole, parentesi tonde o punti.
- **Non promettere sconti, non anticipare trattative sul prezzo, non garantire tempi.** Se l'obiezione è sul prezzo, la risposta apre un confronto, non concede una cifra.
- **Non inventare dati**: nessun costo di ristrutturazione stimato, nessun consumo energetico in euro, nessun confronto con "immobili simili" che non ti è stato fornito. Dove servirebbe un numero che non hai, proponi di verificarlo insieme.
- Non dichiarare conformità, abitabilità o assenza di vincoli: quelle le attesta un tecnico.
- Chiudi con una domanda o una proposta concreta: un messaggio che si chiude su se stesso interrompe la conversazione.

# Regole sulla strategia
- Dì **perché** l'obiezione nasce (cosa teme davvero il cliente) e **cosa fare se insiste**.
- Niente frasi da manuale motivazionale. Frasi asciutte, da collega esperto.`;

function descriviImmobile(contesto: ContestoImmobile, trattativa?: string): string {
  const righe: string[] = [];

  const aggiungi = (etichetta: string, valore: unknown) => {
    if (valore === null || valore === undefined || valore === "") return;
    righe.push(`${etichetta}: ${valore}`);
  };

  aggiungi("Tipologia", contesto.tipologia);
  aggiungi("Prezzo richiesto", contesto.prezzoEur ? `${contesto.prezzoEur} euro` : null);
  aggiungi("Comune", contesto.comune);
  aggiungi("Zona", contesto.zona);
  aggiungi("Superficie", contesto.superficie ? `${contesto.superficie} m²` : null);
  aggiungi("Locali", contesto.locali);
  aggiungi("Bagni", contesto.bagni);
  aggiungi("Piano", contesto.piano);
  aggiungi("Classe energetica", contesto.classeEnergetica);
  aggiungi("Descrizione della scheda", contesto.descrizione?.slice(0, 1200));
  aggiungi("Punti di forza indicati dall'agente", contesto.puntiDiForza);
  aggiungi("Criticità note all'agente", contesto.criticita);

  if (trattativa) righe.push(`Contesto della trattativa: ${trattativa}`);

  return righe.join("\n");
}

export type EsitoObiezioni =
  | { ok: true; obiezioni: Objection[] }
  | { ok: false; errore: string };

export async function generaObiezioni(
  contesto: ContestoImmobile,
  trattativa?: string
): Promise<EsitoObiezioni> {
  const descrizione = descriviImmobile(contesto, trattativa);

  try {
    const risposta = await client.messages.parse({
      model: MODELLO,
      max_tokens: 4096,
      system: SYSTEM,
      output_config: {
        effort: "medium",
        format: zodOutputFormat(objectionsSchema),
      },
      messages: [
        {
          role: "user",
          content: `Immobile in trattativa:\n\n${descrizione}\n\nGenera le obiezioni più probabili di chi lo visita, con risposta e strategia.`,
        },
      ],
    });

    const risultato = risposta.parsed_output;
    if (!risultato) {
      return { ok: false, errore: "Non sono riuscito a interpretare la risposta dell'AI. Riprova." };
    }

    /*
     * Il tetto si applica qui, non nello schema.
     *
     * Un vincolo di lunghezza dentro lo schema fa fallire l'intera risposta
     * quando il modello ne produce sei: si perderebbero cinque obiezioni
     * buone per una di troppo. Tagliare è sempre meglio che rigettare.
     */
    const obiezioni = risultato.obiezioni
      .filter((voce) => voce.obiezione.trim() && voce.script.trim())
      .slice(0, MAX_OBIEZIONI);

    if (obiezioni.length === 0) {
      return {
        ok: false,
        errore:
          "Con questi dati non sono emerse obiezioni specifiche. Aggiungi prezzo, zona o le criticità che conosci.",
      };
    }

    return { ok: true, obiezioni };
  } catch (error) {
    reportAiError(error, "bonuses/objections");
    return {
      ok: false,
      errore: "L'AI non è raggiungibile in questo momento. Gli script qui sotto restano disponibili.",
    };
  }
}
