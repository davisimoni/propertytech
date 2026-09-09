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
 *
 * L'unica eccezione apparente è `propertyAddress`, che è l'ubicazione del
 * bene: compare già nell'avviso di vendita pubblicato dal Tribunale, quindi
 * non aggiunge nulla che non sia pubblico. La residenza dell'esecutato, che
 * la perizia riporta e che pubblica non è, resta esclusa.
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

  propertyAddress: z
    .string()
    .nullable()
    .describe(
      "Indirizzo e civico dell'IMMOBILE oggetto della vendita, come riportato nella perizia (es. 'Via Emilia 45'). Solo via e numero, senza CAP ne' comune. null se la perizia non lo riporta. ATTENZIONE: e' l'ubicazione del bene, NON la residenza dell'esecutato o di terzi, che non va mai riportata."
    ),

  appraisedValueEur: z
    .number()
    .int()
    .nullable()
    .describe(
      "VALORE DI STIMA del bene secondo il perito, in euro. E' la valutazione tecnica dell'immobile, NON il prezzo a cui parte l'asta. null se non presente."
    ),

  /*
   * I campi che permettono di partire dalla perizia invece che dalla tastiera.
   *
   * Sono gli stessi che la scheda pretende come obbligatori — comune,
   * tipologia, superficie, offerta minima — e finche' li scriveva l'agente,
   * caricare la perizia era l'ULTIMO passo invece che il primo. Ricavarli qui
   * inverte il flusso: si parte dal PDF e si verifica, invece di ricopiare
   * sessanta pagine a mano.
   *
   * Tutti nullable senza eccezioni: una perizia puo' tacere su qualunque di
   * questi, e un campo lasciato vuoto che l'agente compila guardando l'avviso
   * di vendita vale piu' di un valore dedotto per riempire lo spazio.
   */

  comune: z
    .string()
    .nullable()
    .describe(
      "Comune in cui si trova l'immobile, come riportato in perizia. Solo il nome del comune, senza provincia ne' CAP (es. 'Vignola'). null se non riportato."
    ),

  propertyType: z
    .enum([
      "APPARTAMENTO",
      "ATTICO",
      "VILLA",
      "VILLETTA",
      "LOFT",
      "RUSTICO",
      "TERRENO",
      "NEGOZIO",
      "UFFICIO",
      "BOX",
      "ALTRO",
    ])
    .nullable()
    .describe(
      "Tipologia del bene principale del lotto. Usa ALTRO quando non rientra nelle categorie (es. capannone, magazzino). null se la perizia non permette di stabilirlo."
    ),

  squareMeters: z
    .number()
    .int()
    .nullable()
    .describe(
      "Superficie COMMERCIALE del bene principale in metri quadri. Se la perizia riporta piu' superfici (catastale, utile, lorda) preferisci la commerciale; se manca, usa la lorda. Non sommare le pertinenze (box, cantina) al bene principale. null se non determinabile."
    ),

  minimumBidEur: z
    .number()
    .int()
    .nullable()
    .describe(
      "OFFERTA MINIMA ammessa per partecipare, in euro — di norma inferiore al prezzo base (spesso il 75%). Non confonderla ne' con il prezzo base d'asta ne' con il valore di stima. null se la perizia non la indica: spesso compare solo nell'avviso di vendita, e in quel caso NON dedurla con un calcolo tuo."
    ),

  auctionDate: z
    .string()
    .nullable()
    .describe(
      "Data e ora della vendita in formato ISO 8601 (es. '2026-11-14T15:00:00'). Se la data e' nota ma non l'ora, usa le 00:00. null se la perizia non la riporta: e' frequente, perche' la data sta nell'avviso di vendita e non nella perizia."
    ),

  lotto: z
    .string()
    .nullable()
    .describe(
      "Identificativo del lotto come lo chiama la perizia (es. 'Lotto 1', 'Lotto unico'). null se il documento non lo numera."
    ),

  summary: z
    .string()
    .describe(
      "Sintesi in 4-6 frasi di cosa un agente deve sapere prima di valutare il lotto: consistenza, stato di fatto, criticità principali. Nessun nome di persona. Nessuna raccomandazione su cosa fare."
    ),
});

export type AuctionAppraisalResult = z.infer<typeof auctionAppraisalSchema>;
