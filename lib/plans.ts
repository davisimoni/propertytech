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

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: "trial",
    name: "Free Trial",
    audience: "Per provare senza carta di credito",
    priceEurMonthly: null,
    waConversationsLimit: 15,
    ocrDocumentsLimit: 5,
    seatsLimit: 1,
    agendasLimit: 0,
    voiceReportsLimit: 0,
    documentVault: false,
    socialMultiplier: false,
    voiceSellerReporting: false,
    advancedReporting: false,
  },
  starter: {
    id: "starter",
    name: "Starter",
    audience: "Per agenti singoli",
    priceEurMonthly: 99,
    waConversationsLimit: 150,
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
    audience: "Per agenzie strutturate, fino a 5 agenti",
    priceEurMonthly: 279,
    waConversationsLimit: 500,
    ocrDocumentsLimit: null,
    seatsLimit: 5,
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
    waConversationsLimit: 1500,
    ocrDocumentsLimit: null,
    seatsLimit: 20,
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
