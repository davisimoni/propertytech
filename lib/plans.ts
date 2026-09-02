export type PlanId = "trial" | "starter" | "pro" | "enterprise";

export type BillingInterval = "monthly" | "yearly";

/** Sconto applicato scegliendo la fatturazione annuale anziché mensile. */
export const YEARLY_DISCOUNT_RATE = 0.1;

export const YEARLY_DISCOUNT_LABEL = `${Math.round(YEARLY_DISCOUNT_RATE * 100)}%`;

export interface Plan {
  id: PlanId;
  name: string;
  priceEurMonthly: number | null;
  /** A quale dimensione di agenzia si rivolge il piano. Mostrato nel listino. */
  audience: string;
  waConversationsLimit: number;
  /**
   * Nota sui consumi oltre la soglia mensile, se il piano la prevede — solo
   * informativa nel listino: non esiste (ancora) un billing a consumo che
   * addebiti automaticamente le chat extra oltre `waConversationsLimit`.
   */
  waConversationsOverageNote: string | null;
  ocrDocumentsLimit: number | null;
  /**
   * Postazioni incluse: quante persone possono accedere per quell'agenzia.
   * `null` = illimitate. Il Trial ne ha una sola, quella di chi si registra.
   */
  seatsLimit: number | null;
  agendasLimit: number | null;
  voiceReportsLimit: number | null;
  /**
   * Fascicolo documentale: archivio per immobile e per cliente, con scadenze
   * dei documenti e conservazione decennale (D.Lgs. 231/2007).
   *
   * Escluso dal Trial: la conservazione decennale è una promessa che non ha
   * senso fare su un account di prova che può sparire in due settimane.
   */
  documentVault: boolean;
  socialMultiplier: boolean;
  voiceSellerReporting: boolean;
  advancedReporting: boolean;
}

/**
 * Postazione aggiuntiva, oltre quelle incluse nel piano.
 *
 * Si acquista solo sul Professional. Sullo Starter no — chi ha bisogno di piu'
 * di una persona ha bisogno anche delle conversazioni e delle agende che il
 * Professional porta con se', e vendergli tre postazioni su un piano da 150
 * chat al mese significa vendergli un limite che raggiungera' il mese dopo.
 * Sull'Enterprise nemmeno: li' le postazioni si concordano.
 */
export const EXTRA_SEAT_PRICE_EUR = 29;

/** I piani su cui si possono comprare postazioni in piu'. */
export const PLANS_WITH_EXTRA_SEATS: PlanId[] = ["pro"];

export function canBuyExtraSeats(planId: PlanId): boolean {
  return PLANS_WITH_EXTRA_SEATS.includes(planId);
}

/**
 * Postazioni totali dell'agenzia: quelle del piano piu' quelle acquistate.
 *
 * `null` significa illimitate ed e' il caso dell'Enterprise, dove il numero si
 * concorda invece di comprarlo a pezzi. Un piano illimitato resta illimitato
 * qualunque cosa dica `extraSeats`: sommare a null non ha senso, e un residuo
 * di postazioni acquistate su un piano precedente non deve trasformarsi in un
 * tetto dove tetto non c'e'.
 */
export function maxSeatsFor(plan: Plan, extraSeats: number): number | null {
  if (plan.seatsLimit === null) return null;
  return plan.seatsLimit + Math.max(0, extraSeats);
}

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: "trial",
    name: "Free Trial",
    audience: "Per provare senza carta di credito",
    priceEurMonthly: null,
    waConversationsLimit: 15,
    waConversationsOverageNote: null,
    ocrDocumentsLimit: 5,
    seatsLimit: 1,
    agendasLimit: 0,
    /**
     * Assaggio del Voice Seller-Reporting: tre report, poi il gate a crediti
     * si chiude. È l'unica funzione Enterprise concessa in prova, e a
     * differenza delle altre non è illimitata — un modulo che si può provare
     * ma non usare a regime è ciò che rende evidente il valore del piano
     * Enterprise, mentre lasciarlo chiuso lo rende invisibile.
     *
     * Il flag resta `false` su Starter e Professional: lì la funzione non è
     * inclusa davvero, e il gate risponde "non nel tuo piano" indirizzando a
     * Enterprise (vedi `cheapestPlanWith` in lib/feature-access.ts).
     */
    voiceReportsLimit: 3,
    documentVault: false,
    socialMultiplier: false,
    voiceSellerReporting: true,
    advancedReporting: false,
  },
  starter: {
    id: "starter",
    name: "Starter",
    audience: "Per agenti singoli",
    priceEurMonthly: 99,
    waConversationsLimit: 150,
    waConversationsOverageNote: null,
    ocrDocumentsLimit: null,
    seatsLimit: 1,
    agendasLimit: 1,
    voiceReportsLimit: 0,
    documentVault: true,
    socialMultiplier: false,
    voiceSellerReporting: false,
    advancedReporting: false,
  },
  pro: {
    id: "pro",
    name: "Professional",
    audience: "Per agenzie strutturate, con postazioni aggiuntive a richiesta",
    priceEurMonthly: 279,
    waConversationsLimit: 500,
    waConversationsOverageNote: null,
    ocrDocumentsLimit: null,
    seatsLimit: 3,
    agendasLimit: 3,
    voiceReportsLimit: 0,
    documentVault: true,
    socialMultiplier: false,
    voiceSellerReporting: false,
    advancedReporting: false,
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    audience: "Per network e agenzie pluri-sede",
    priceEurMonthly: 499,
    waConversationsLimit: 2500,
    waConversationsOverageNote: "extra a 0,05€/chat",
    ocrDocumentsLimit: null,
    seatsLimit: null,
    agendasLimit: null,
    voiceReportsLimit: null,
    documentVault: true,
    socialMultiplier: true,
    voiceSellerReporting: true,
    advancedReporting: true,
  },
};

export interface PlanPricing {
  /** Importo mostrato accanto a "/mese": con l'annuale è la quota mensile scontata. */
  monthlyEquivalent: number | null;
  /** Totale effettivamente addebitato al momento del pagamento. */
  chargedAmount: number | null;
  /** Risparmio annuo rispetto a 12 mensilità, solo per l'intervallo annuale. */
  yearlySaving: number | null;
}

/**
 * Prezzi di un piano per l'intervallo scelto.
 *
 * L'annuale espone sia la quota mensile equivalente sia il totale addebitato:
 * mostrare solo il totale (5.389 €) accanto a un prezzo mensile renderebbe i
 * piani incomparabili a colpo d'occhio, mostrare solo la quota nasconderebbe
 * quanto viene addebitato davvero.
 */
export function getPlanPricing(plan: Plan, interval: BillingInterval): PlanPricing {
  if (plan.priceEurMonthly === null) {
    return { monthlyEquivalent: null, chargedAmount: null, yearlySaving: null };
  }

  if (interval === "monthly") {
    return {
      monthlyEquivalent: plan.priceEurMonthly,
      chargedAmount: plan.priceEurMonthly,
      yearlySaving: null,
    };
  }

  const fullYear = plan.priceEurMonthly * 12;
  const chargedAmount = Math.round(fullYear * (1 - YEARLY_DISCOUNT_RATE));

  return {
    // Arrotondato all'euro: i decimali su un prezzo di listino confondono.
    monthlyEquivalent: Math.round(chargedAmount / 12),
    chargedAmount,
    yearlySaving: fullYear - chargedAmount,
  };
}

/** Formatta un importo in euro senza decimali, come nel resto del listino. */
export function formatEur(amount: number): string {
  return `${amount.toLocaleString("it-IT")}€`;
}

/**
 * Conteggi con il separatore delle migliaia sempre presente.
 *
 * `it-IT` per impostazione predefinita lo omette sui numeri a quattro cifre —
 * `(1500).toLocaleString("it-IT")` restituisce "1500" — e il limite del piano
 * Enterprise finirebbe scritto in due modi diversi a seconda di dove compare.
 */
const COUNT_FORMAT = new Intl.NumberFormat("it-IT", { useGrouping: "always" });

export function formatCount(value: number): string {
  return COUNT_FORMAT.format(value);
}
