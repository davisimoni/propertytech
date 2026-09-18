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
   * Nota sui consumi oltre la soglia mensile, se il piano la prevede.
   *
   * Sull'Enterprise corrisponde a un addebito vero: le conversazioni oltre
   * `waConversationsLimit` si inviano al contatore Stripe e compaiono nella
   * fattura del mese (vedi `lib/billing/overage.ts`).
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
   * Perizie del Radar analizzabili in un mese. `0` = modulo non incluso.
   *
   * A consumo e non a flag come il Social Multiplier, perche' una perizia e'
   * un PDF di centinaia di pagine letto dal modello: e' la chiamata piu' cara
   * della piattaforma, e su un piano a 99 euro un uso senza tetto costa piu'
   * di quanto il piano rende.
   */
  radarAppraisalsLimit: number | null;
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
 *
 * # Deve coincidere con il prezzo su Stripe
 *
 * Questo numero è quello che l'agenzia legge prima di comprare (pannello Team
 * e riepilogo del costo mensile), mentre l'addebito lo fa il prezzo Stripe
 * indicato da `STRIPE_PRICE_ID_EXTRA_SEAT`. I due non sono collegati da nulla
 * se non da questa riga: stava a 29 € mentre Stripe ne addebitava 19, e
 * nessun errore lo segnalava. Se cambi il prezzo su Stripe, cambialo qui.
 */
export const EXTRA_SEAT_PRICE_EUR = 19;

/**
 * Conversazioni WhatsApp contenute in un pacchetto di ricarica.
 *
 * Vive qui e non nella rotta perché lo mostra anche l'interfaccia ("pacchetto
 * da 100 conversazioni") e i due numeri non devono poter divergere. Il
 * **prezzo** invece non sta qui: lo conosce solo Stripe, e Checkout lo mostra
 * all'agente prima di pagare. Scriverlo anche da questa parte significherebbe
 * poterlo cambiare su Stripe e continuare a mostrarne un altro in pagina.
 */
export const EXTRA_CREDITS_PACK_SIZE = 100;

/**
 * Chi può comprare un pacchetto di conversazioni.
 *
 * - **Starter e Professional**: sempre.
 * - **Enterprise**: solo quando il consumo a pagamento **non** è attivo —
 *   annuale, account assegnati a mano ai beta tester, voce a consumo non
 *   ancora vista dal webhook. Lì oltre le incluse l'assistente si fermerebbe,
 *   e il pacchetto è l'unico modo di non restare bloccati fino al mese dopo.
 *   Con il consumo attivo no: pagherebbe in anticipo conversazioni che gli
 *   verrebbero addebitate solo usandole.
 * - **Trial**: mai. Chi è in prova deve passare a un piano, non comprare
 *   crediti per una prova.
 *
 * `overageActive` lo calcola il server (`isOverageBillingActive`): la stessa
 * funzione decide per la rotta di acquisto e, tramite le statistiche, per il
 * pulsante.
 */
export const PLANS_WITH_CREDIT_RECHARGE: PlanId[] = ["starter", "pro"];

export function canRechargeCredits(planId: PlanId, overageActive = false): boolean {
  if (PLANS_WITH_CREDIT_RECHARGE.includes(planId)) return true;
  return planId === "enterprise" && !overageActive;
}

/**
 * Prezzo di ogni conversazione WhatsApp oltre l'incluso Enterprise.
 *
 * # Deve coincidere con il prezzo su Stripe
 *
 * Come `EXTRA_SEAT_PRICE_EUR`: questo numero è quello che l'agenzia legge
 * (listino, stima nel pannello consumi, email), mentre l'addebito lo fa il
 * prezzo a consumo indicato da `STRIPE_PRICE_ID_ENTERPRISE_OVERAGE`. Se cambi
 * il prezzo su Stripe, cambialo qui.
 */
export const ENTERPRISE_OVERAGE_PRICE_EUR = 0.05;

/** I piani che oltre l'incluso proseguono a consumo invece di fermarsi. */
export function hasMeteredOverage(planId: PlanId): boolean {
  return planId === "enterprise";
}

/** Importo con i centesimi, per i prezzi a consumo: "0,05 €" e non "0€". */
export function formatEurCents(amount: number): string {
  return `${amount.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

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
    /*
     * Voice Seller-Reporting escluso dalla prova.
     *
     * Prima il Trial ne concedeva tre come assaggio. La trascrizione di una
     * nota vocale e la stesura del report sono due chiamate al modello per
     * ogni visita, su un account che non ha dato una carta: e' la funzione
     * piu' facile da usare in volume da chi non ha intenzione di pagare.
     * Resta Enterprise, e chi vuole vederla la vede in dimostrazione.
     */
    voiceReportsLimit: 0,
    radarAppraisalsLimit: 0,
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
    waConversationsOverageNote: null,
    ocrDocumentsLimit: null,
    seatsLimit: 1,
    agendasLimit: 1,
    voiceReportsLimit: 0,
    radarAppraisalsLimit: 5,
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
    radarAppraisalsLimit: 25,
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
    waConversationsOverageNote: `extra a ${formatEurCents(ENTERPRISE_OVERAGE_PRICE_EUR)}/chat`,
    ocrDocumentsLimit: null,
    seatsLimit: null,
    agendasLimit: null,
    voiceReportsLimit: null,
    radarAppraisalsLimit: 100,
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

/**
 * Le righe del listino, in un posto solo.
 *
 * # Perché
 *
 * Perché finora il listino pubblico e la scheda Piani nelle Impostazioni
 * elencavano le stesse funzioni scrivendole a mano, ciascuno per conto suo.
 * Leggevano gli stessi dati da `PLANS`, ma decidevano separatamente COSA
 * mostrare e come formattarlo: aggiungere una funzione voleva dire ricordarsi
 * di due file, e dimenticarne uno significa un listino pubblico che promette
 * cose diverse da quello che l'agenzia legge dopo aver pagato.
 *
 * `boolean` per le funzioni incluse o escluse, `string` per quelle che hanno
 * un numero: chi rende decide come disegnare il segno di spunta e la crocetta,
 * ma non decide più quali righe esistono.
 */
export interface PlanFeatureRow {
  label: string;
  value: string | boolean;
}

function conteggio(limit: number | null, illimitato: string): string | false {
  if (limit === null) return illimitato;
  // `false` e non un trattino: il listino sa gia' disegnare una funzione
  // assente, con la crocetta accanto all'etichetta. Un "—" in mezzo ai valori
  // si legge come un dato mancante, che e' un'altra cosa.
  if (limit === 0) return false;
  return formatCount(limit);
}

export function planFeatureRows(plan: Plan): PlanFeatureRow[] {
  return [
    {
      label: "Conversazioni WhatsApp",
      value:
        plan.id === "trial"
          ? `${formatCount(plan.waConversationsLimit)} totali`
          : `${formatCount(plan.waConversationsLimit)}/mese`,
    },
    {
      label: "Lettura visure e atti",
      value: conteggio(plan.ocrDocumentsLimit, "illimitate"),
    },
    { label: "Postazioni", value: conteggio(plan.seatsLimit, "illimitate") },
    { label: "Agende", value: conteggio(plan.agendasLimit, "illimitate") },
    {
      label: "Analisi & Due Diligence Aste",
      // Il numero e non un semplice "incluso": e' il dato che distingue i tre
      // piani a pagamento fra loro, e nasconderlo dietro una spunta
      // lascerebbe credere che sia illimitato ovunque.
      value:
        plan.radarAppraisalsLimit === null
          ? "perizie illimitate"
          : plan.radarAppraisalsLimit === 0
            ? false
            : `${plan.radarAppraisalsLimit} perizie/mese`,
    },
    { label: "Fascicolo documentale", value: plan.documentVault },
    { label: "Social Multiplier", value: plan.socialMultiplier },
    { label: "Voice Seller-Reporting", value: plan.voiceSellerReporting },
  ];
}

/**
 * Come si scrive il prezzo di un piano nel listino.
 *
 * # Perché anche questo in un posto solo
 *
 * Perché era l'ultima cosa che le due pagine decidevano per conto proprio, e
 * infatti erano divergenti: il listino pubblico scriveva "0€ per sempre", le
 * Impostazioni "Gratuito". Due modi di dire la stessa cosa fanno dubitare che
 * sia la stessa cosa — e su un prezzo il dubbio costa la registrazione.
 *
 * Un piano gratuito non ha un importo: ha un'etichetta. "0€" invita a
 * cercare cosa costa davvero, e "/mese" su un prezzo che non si paga mai non
 * vuol dire niente. Per questo `suffix` è `null` e non una stringa vuota:
 * chi rende non deve nemmeno decidere se disegnare lo spazio.
 */
export interface PlanPriceLabel {
  /** Cifra grande: l'importo, oppure "Gratuito". */
  amount: string;
  /** Testo piccolo accanto. `null` quando non c'è niente da aggiungere. */
  suffix: string | null;
}

export function formatPlanPrice(plan: Plan, monthlyEquivalent: number | null): PlanPriceLabel {
  if (plan.priceEurMonthly === null) {
    return { amount: "Gratuito", suffix: null };
  }

  return { amount: formatEur(monthlyEquivalent ?? plan.priceEurMonthly), suffix: "/mese" };
}
