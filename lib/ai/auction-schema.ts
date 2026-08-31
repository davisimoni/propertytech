import { z } from "zod";

/**
 * Cosa si estrae da una perizia giudiziaria.
 *
 * # Il modello riferisce, non valuta
 *
 * Nessun campo chiede un giudizio: non c'è "conviene", non c'è un punteggio,
 * non c'è il colore del semaforo. Quello lo calcola `lib/radar/risk.ts` da
 * questi fatti, con criteri scritti e mostrati all'agente. Qui si chiede solo
 * cosa il documento dice — che è l'unica cosa che un modello può affermare
 * senza assumersi una responsabilità che non è sua.
 *
 * # Perché mancano i dati del debitore
 *
 * Una perizia contiene nome, situazione patrimoniale e talvolta condizioni
 * familiari o di salute dell'esecutato: persone che non sono clienti
 * dell'agenzia, non hanno prestato consenso, e i cui dati sono in parte di
 * natura giudiziaria. All'agenzia servono le caratteristiche dell'immobile,
 * non l'identità di chi lo sta perdendo. Non c'è alcun campo per accoglierli:
 * il modo più solido di non trattare un dato è non avere dove metterlo.
 */
export const auctionAppraisalSchema = z.object({
  occupancy: z
    .enum(["LIBERO", "OCCUPATO_CON_TITOLO", "OCCUPATO_SENZA_TITOLO", "NON_DETERMINATO"])
    .describe(
      "Stato occupazionale accertato dal perito. NON_DETERMINATO se la perizia non lo chiarisce: non dedurlo."
    ),

  irregularities: z
    .array(z.string())
    .describe(
      "Difformità edilizie o urbanistiche rilevate, una per voce, citando il fatto come lo riporta la perizia. Se il perito indica che una difformità NON è sanabile, riportalo con quelle parole. Array vuoto se la perizia non ne rileva."
    ),

  encumbrances: z
    .array(z.string())
    .describe(
      "Vincoli, gravami, servitù, diritti di terzi o pesi che restano a carico dell'aggiudicatario. Escludi le iscrizioni che il decreto di trasferimento cancella, se la perizia lo precisa. Array vuoto se non ve ne sono."
    ),

  remediationCostMinEur: z
    .number()
    .int()
    .nullable()
    .describe("Estremo minimo del costo di sanatoria stimato dal perito, in euro. null se non stimato."),

  remediationCostMaxEur: z
    .number()
    .int()
    .nullable()
    .describe("Estremo massimo del costo di sanatoria stimato dal perito, in euro. null se non stimato."),

  appraisedValueEur: z
    .number()
    .int()
    .nullable()
    .describe("Valore di stima dell'immobile indicato dal perito, in euro. null se non presente."),

  summary: z
    .string()
    .describe(
      "Sintesi in 4-6 frasi di cosa un agente deve sapere prima di valutare il lotto: consistenza, stato di fatto, criticità principali. Nessun nome di persona. Nessuna raccomandazione su cosa fare."
    ),
});

export type AuctionAppraisalResult = z.infer<typeof auctionAppraisalSchema>;
