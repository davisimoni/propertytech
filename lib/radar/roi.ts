/**
 * Simulatore economico di un'operazione all'asta.
 *
 * # Perché è codice puro e non una stima del modello
 *
 * Come il semaforo di rischio: sono quattro operazioni aritmetiche su numeri
 * che l'agente ha inserito o corretto, e il risultato finisce in un prospetto
 * che può arrivare a un investitore. Chi lo legge deve poter rifare il conto
 * su un foglio e trovare lo stesso numero — non fidarsi di una stima.
 *
 * # Cosa il calcolo NON include
 *
 * Non ci sono qui: interessi su un eventuale finanziamento, tempi di
 * aggiudicazione e di cantiere, costi di gestione o sfitto, imposte sulla
 * plusvalenza. Un rendimento annuo lordo che ignora tre mesi di lavori è
 * ottimista di quei tre mesi, ed è per questo che il prospetto lo dichiara
 * invece di presentare il numero come netto.
 */

export interface RoiInput {
  /** Prezzo d'acquisto: offerta minima per un'asta, prezzo corrente altrimenti. */
  priceEur: number;
  /** Imposte e spese di trasferimento. */
  transferCostsEur: number | null;
  /** Ristrutturazione e sanatoria. */
  renovationCostEur: number | null;
  /** Valore di mercato atteso a lavori conclusi. */
  marketValueEur: number | null;
  /** Canone mensile atteso. */
  monthlyRentEur: number | null;
}

export interface RoiResult {
  /** Base + sanatoria + imposte. Sempre calcolabile: gli assenti valgono zero. */
  totalInvestedEur: number;
  /** Margine sulla rivendita, in euro. `null` senza valore di mercato. */
  flipMarginEur: number | null;
  /** Margine sulla rivendita, in percentuale sul capitale investito. */
  flipRoiPct: number | null;
  /** Rendimento lordo annuo da locazione, in percentuale. */
  grossYieldPct: number | null;
  /** Quali dati mancano per completare il quadro. */
  missing: string[];
}

/** Arrotonda a una cifra decimale: oltre, la precisione è finta. */
const perc = (v: number) => Math.round(v * 10) / 10;

export function computeRoi(input: RoiInput): RoiResult {
  const sanatoria = input.renovationCostEur ?? 0;
  const imposte = input.transferCostsEur ?? 0;

  const totalInvestedEur = input.priceEur + sanatoria + imposte;

  const missing: string[] = [];
  if (input.transferCostsEur === null) missing.push("imposte e spese di trasferimento");
  if (input.renovationCostEur === null) missing.push("costo di ristrutturazione");

  let flipMarginEur: number | null = null;
  let flipRoiPct: number | null = null;

  if (input.marketValueEur !== null && totalInvestedEur > 0) {
    flipMarginEur = input.marketValueEur - totalInvestedEur;
    flipRoiPct = perc((flipMarginEur / totalInvestedEur) * 100);
  } else {
    missing.push("valore di mercato a lavori conclusi");
  }

  let grossYieldPct: number | null = null;
  if (input.monthlyRentEur !== null && totalInvestedEur > 0) {
    grossYieldPct = perc(((input.monthlyRentEur * 12) / totalInvestedEur) * 100);
  } else {
    missing.push("canone mensile atteso");
  }

  return { totalInvestedEur, flipMarginEur, flipRoiPct, grossYieldPct, missing };
}

/**
 * Percentuale di ribasso fra due prezzi.
 *
 * `null` quando non c'è un ribasso vero: un prezzo salito o invariato non è
 * una notizia, e mostrarlo come "−0%" farebbe scattare un avviso per nulla.
 */
export function dropPercent(previousEur: number | null, currentEur: number): number | null {
  if (previousEur === null || previousEur <= currentEur) return null;
  return Math.round(((previousEur - currentEur) / previousEur) * 100);
}

/**
 * Ipotesi di partenza per i campi del simulatore.
 *
 * # A cosa serve, e cosa NON e'
 *
 * A togliere il foglio bianco. L'agente apriva quattro campi vuoti e, non
 * avendo i numeri sottomano, chiudeva la scheda: il simulatore restava
 * inutilizzato non perche' sbagliasse i conti, ma perche' chiedeva di
 * cominciare da zero.
 *
 * Non e' una valutazione. Sono convenzioni dichiarate, che l'agente
 * sovrascrive con i numeri veri appena li ha — ed e' il motivo per cui ogni
 * stima porta con se' la frase che dice da dove esce.
 */
export interface RoiSuggestion {
  value: number;
  /** Da dove esce il numero, mostrato accanto al campo. */
  basis: string;
}

/**
 * Aliquota usata per le imposte di trasferimento.
 *
 * Il 9% e' l'imposta di registro su un acquisto che NON gode delle
 * agevolazioni prima casa, che e' il caso normale per chi compra all'asta
 * per rivendere o mettere a reddito. Con la prima casa scende al 2%, e
 * l'agente corregge: e' proprio il genere di dato che dipende da chi compra e
 * che non possiamo sapere noi.
 *
 * Restano fuori compenso del delegato, spese di custodia e oneri di
 * cancellazione: variano per tribunale e la perizia non li riporta.
 */
export const TRANSFER_TAX_RATE = 0.09;

/**
 * Resa lorda annua usata per stimare il canone.
 *
 * Il 5% e' una convenzione di settore per l'immobile residenziale italiano,
 * NON un dato della zona: non abbiamo canoni di riferimento per comune, e
 * spacciare per locale una stima che locale non e' porterebbe l'agente a
 * fidarsene piu' di quanto meriti.
 */
export const GROSS_YIELD_ASSUMPTION = 0.05;

export function suggestRoiInputs(input: {
  /** Prezzo di acquisto: base d'asta o prezzo richiesto. */
  priceEur: number;
  /** Valore di stima del perito, se la perizia lo riporta. */
  appraisedValueEur: number | null;
  /** Estremo massimo del costo di sanatoria stimato dal perito. */
  remediationCostMaxEur: number | null;
}): {
  transferCostsEur: RoiSuggestion | null;
  renovationCostEur: RoiSuggestion | null;
  marketValueEur: RoiSuggestion | null;
  monthlyRentEur: RoiSuggestion | null;
} {
  const transferCostsEur =
    input.priceEur > 0
      ? {
          value: Math.round(input.priceEur * TRANSFER_TAX_RATE),
          basis: "9% del prezzo — registro senza agevolazione prima casa",
        }
      : null;

  /*
   * Lo zero e' un valore, non un'assenza.
   *
   * Se il perito ha stimato zero costi di sanatoria, il campo va riempito con
   * zero: lasciarlo vuoto farebbe elencare "costo di ristrutturazione" fra i
   * dati mancanti del simulatore, mettendo in cerca di un numero che la
   * perizia ha gia' dato. Sul prezzo e sul valore di stima vale il contrario —
   * li' uno zero e' un dato non compilato, e infatti restano esclusi.
   */
  const renovationCostEur =
    input.remediationCostMaxEur != null && input.remediationCostMaxEur >= 0
      ? {
          value: input.remediationCostMaxEur,
          // L'estremo ALTO, non la media: su una sanatoria si sbaglia per
          // difetto, e un margine che regge sul costo massimo regge davvero.
          basis: "costo massimo di sanatoria stimato dal perito",
        }
      : null;

  const marketValueEur =
    input.appraisedValueEur != null && input.appraisedValueEur > 0
      ? {
          value: input.appraisedValueEur,
          basis: "valore di stima della perizia, prima dei lavori",
        }
      : null;

  /*
   * Il canone si stima dal valore di mercato, non dal prezzo d'asta.
   *
   * Un lotto aggiudicato al 60% della stima non si affitta al 60% del canone:
   * l'affitto dipende da quanto vale la casa, non da quanto e' costata.
   */
  const baseCanone = marketValueEur?.value ?? null;
  const monthlyRentEur =
    baseCanone != null
      ? {
          value: Math.round((baseCanone * GROSS_YIELD_ASSUMPTION) / 12),
          basis: "ipotesi di resa lorda 5% annua sul valore di mercato",
        }
      : null;

  return { transferCostsEur, renovationCostEur, marketValueEur, monthlyRentEur };
}
