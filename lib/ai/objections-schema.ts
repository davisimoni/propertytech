import { z } from "zod";

/**
 * Obiezioni di chi compra, calcolate su un immobile preciso.
 *
 * # Perché tre campi e non solo la risposta
 *
 * Perché uno script incollato senza capirlo si sente. L'obiezione serve a
 * riconoscere il momento, la strategia serve a reggere la conversazione quando
 * il cliente non risponde con la frase prevista — che è quasi sempre. La
 * risposta pronta da sola funziona una volta su tre e lascia l'agente muto le
 * altre due.
 */

export const objectionSchema = z.object({
  /** Come la direbbe il cliente, con le sue parole. */
  obiezione: z.string(),
  /** Il messaggio WhatsApp pronto da inviare, in forma di cortesia. */
  script: z.string(),
  /** Perché quella risposta funziona: è per l'agente, non per il cliente. */
  strategia: z.string(),
});

export const objectionsSchema = z.object({
  obiezioni: z.array(objectionSchema),
});

export type Objection = z.infer<typeof objectionSchema>;
export type Objections = z.infer<typeof objectionsSchema>;

/** Quante ne servono: meno di tre è povero, più di cinque non si legge. */
export const MIN_OBIEZIONI = 3;
export const MAX_OBIEZIONI = 5;

/**
 * I dati dell'immobile su cui si calcolano le obiezioni.
 *
 * Tutti facoltativi di proposito: arrivano da una scheda di portafoglio, da un
 * form compilato a mano o da una via di mezzo, e un campo vuoto deve produrre
 * silenzio su quell'argomento, non un'ipotesi.
 */
export interface ContestoImmobile {
  tipologia?: string | null;
  prezzoEur?: number | null;
  comune?: string | null;
  zona?: string | null;
  superficie?: number | null;
  locali?: number | null;
  bagni?: number | null;
  piano?: string | null;
  classeEnergetica?: string | null;
  descrizione?: string | null;
  /** Scritti dall'agente: non stanno in nessuna scheda. */
  puntiDiForza?: string | null;
  criticita?: string | null;
}

/** Vero se c'è abbastanza per calcolare qualcosa di specifico. */
export function contestoUtile(contesto: ContestoImmobile): boolean {
  return Boolean(
    contesto.tipologia ||
      contesto.prezzoEur ||
      contesto.comune ||
      contesto.zona ||
      contesto.superficie ||
      contesto.classeEnergetica ||
      contesto.descrizione ||
      contesto.puntiDiForza ||
      contesto.criticita
  );
}
