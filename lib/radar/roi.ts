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
