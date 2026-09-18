import "server-only";
import Stripe from "stripe";
import type { CancellationReason } from "@prisma/client";
import type { BillingInterval, PlanId } from "@/lib/plans";
import { isConfiguredSecret, readSecret } from "@/lib/env";
import { REFEREE_WELCOME_DISCOUNT_PERCENT, REFERRER_DISCOUNT_PERCENT } from "@/lib/referrals/constants";
export { isCancellationReason } from "@/lib/billing/cancellation";
export { REFERRER_DISCOUNT_PERCENT, REFEREE_WELCOME_DISCOUNT_PERCENT };

/** Piani acquistabili: `trial` è gratuito e non ha un prezzo su Stripe. */
export type PaidPlanId = Exclude<PlanId, "trial">;

export const PAID_PLAN_IDS: PaidPlanId[] = ["starter", "pro", "enterprise"];

export function isPaidPlanId(value: string): value is PaidPlanId {
  return (PAID_PLAN_IDS as string[]).includes(value);
}

/**
 * Ogni combinazione piano × intervallo ha il proprio Price su Stripe: lo
 * sconto annuale è già incorporato nel prezzo annuale configurato lì, non
 * applicato a runtime — così l'importo mostrato in pagina e quello addebitato
 * non possono divergere.
 */
const PRICE_ENV_BY_PLAN: Record<PaidPlanId, Record<BillingInterval, string>> = {
  starter: {
    monthly: "STRIPE_PRICE_ID_STARTER",
    yearly: "STRIPE_PRICE_ID_STARTER_YEARLY",
  },
  pro: {
    monthly: "STRIPE_PRICE_ID_PROFESSIONAL",
    yearly: "STRIPE_PRICE_ID_PROFESSIONAL_YEARLY",
  },
  enterprise: {
    monthly: "STRIPE_PRICE_ID_ENTERPRISE",
    yearly: "STRIPE_PRICE_ID_ENTERPRISE_YEARLY",
  },
};

/**
 * Prezzo della postazione aggiuntiva, fatturata a quantita'.
 *
 * Una sola voce di prezzo per tutte le postazioni extra: su Stripe la
 * quantita' dell'abbonamento dice quante sono, e cambiarla e' un
 * `subscriptions.update` invece di aggiungere e togliere righe. Anche il
 * conteggio proporzionale sul periodo gia' pagato lo fa Stripe da solo, che e'
 * la ragione principale per cui la quantita' sta li' e non da noi.
 */
const EXTRA_SEAT_PRICE_ENV = "STRIPE_PRICE_ID_EXTRA_SEAT";

/** Prezzo Stripe della postazione aggiuntiva, o `null` se non configurato. */
export function getExtraSeatPriceId(): string | null {
  return readSecret(EXTRA_SEAT_PRICE_ENV) ?? null;
}

/**
 * Prezzo del pacchetto di conversazioni WhatsApp aggiuntive.
 *
 * È un pagamento **una tantum**, non un abbonamento: l'agenzia che esaurisce
 * i crediti a metà mese compra un pacchetto e riparte, senza cambiare piano e
 * senza impegni ricorrenti. Per questo la sessione di Checkout va creata in
 * `mode: "payment"` e non `"subscription"`.
 */
const EXTRA_CREDITS_PRICE_ENV = "STRIPE_PRICE_ID_EXTRA_CREDITS";

/** Prezzo Stripe del pacchetto crediti, o `null` se non configurato. */
export function getExtraCreditsPriceId(): string | null {
  return readSecret(EXTRA_CREDITS_PRICE_ENV) ?? null;
}

/**
 * Prezzo a consumo delle conversazioni WhatsApp oltre l'incluso Enterprise.
 *
 * Su Stripe è un prezzo **metered** mensile collegato a un contatore (Billing
 * Meter): noi inviamo un evento per ogni conversazione in eccesso, Stripe le
 * somma nel periodo e le mette in fattura al rinnovo. Senza questa variabile
 * l'Enterprise resta com'era — si ferma al limite — invece di consumare senza
 * che nessuno addebiti nulla.
 */
const ENTERPRISE_OVERAGE_PRICE_ENV = "STRIPE_PRICE_ID_ENTERPRISE_OVERAGE";

/** Prezzo Stripe a consumo dell'Enterprise, o `null` se non configurato. */
export function getEnterpriseOveragePriceId(): string | null {
  return readSecret(ENTERPRISE_OVERAGE_PRICE_ENV) ?? null;
}

/**
 * Nome dell'evento inviato al contatore Stripe.
 *
 * Deve essere identico all'"Event name" del Meter creato nella Dashboard: è
 * l'unico collegamento fra i due. Un nome diverso non dà errore alla chiamata
 * — Stripe accetta l'evento e lo scarta dopo, senza contatore a cui sommarlo —
 * quindi un refuso qui significa conversazioni extra mai fatturate.
 */
export const WHATSAPP_OVERAGE_METER_EVENT = "whatsapp_extra_conversation";

/**
 * Voce a consumo da aggiungere al Checkout, o `null` se non va aggiunta.
 *
 * # Perché solo sull'Enterprise mensile
 *
 * Perché Stripe non consente, dal Checkout, un abbonamento con voci a
 * intervalli diversi: un Enterprise annuale con il consumo mensile verrebbe
 * rifiutato. E aggiungerla dopo richiederebbe la modalità di fatturazione
 * "flexible", in cui `cancel_at_period_end` — quello che usa la nostra
 * disdetta — chiude l'abbonamento alla fine del periodo più breve: un'agenzia
 * che ha pagato l'anno si troverebbe disdetta a fine mese. L'annuale resta
 * quindi senza consumo, e al limite si ferma come prima.
 *
 * Una voce metered va passata **senza quantità**: la quantità è il consumo.
 */
export function getOverageLineItem(
  plan: PaidPlanId,
  interval: BillingInterval
): { price: string } | null {
  if (plan !== "enterprise" || interval !== "monthly") return null;
  const price = getEnterpriseOveragePriceId();
  return price ? { price } : null;
}

export function isStripeEnabled(): boolean {
  return isConfiguredSecret(process.env.STRIPE_SECRET_KEY);
}

/** Prezzo Stripe per un piano e intervallo, o `null` se non configurato. */
export function getPriceId(plan: PaidPlanId, interval: BillingInterval): string | null {
  return readSecret(PRICE_ENV_BY_PLAN[plan][interval]) ?? null;
}

/** Piani effettivamente acquistabili in questo ambiente, per intervallo. */
export function getPurchasablePlans(interval: BillingInterval): PaidPlanId[] {
  if (!isStripeEnabled()) return [];
  return PAID_PLAN_IDS.filter((plan) => getPriceId(plan, interval) !== null);
}

export function isBillingInterval(value: string): value is BillingInterval {
  return value === "monthly" || value === "yearly";
}

let client: Stripe | null = null;

/**
 * Istanza Stripe creata su richiesta: costruirla all'import farebbe fallire
 * l'avvio dell'app negli ambienti senza chiave configurata.
 */
export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!isConfiguredSecret(secretKey)) {
    throw new Error("Stripe non è configurato: manca STRIPE_SECRET_KEY.");
  }

  if (!client) {
    client = new Stripe(secretKey as string, {
      // Ritenta le richieste di rete fallite; l'idempotenza sulle creazioni è
      // garantita da Stripe tramite la chiave inviata su ogni tentativo.
      maxNetworkRetries: 2,
      timeout: 20_000,
    });
  }

  return client;
}

/** Ricava il piano dai metadati della sessione di Checkout. */
export function readPlanFromMetadata(metadata: Stripe.Metadata | null): PaidPlanId | null {
  const plan = metadata?.planId;
  return typeof plan === "string" && isPaidPlanId(plan) ? plan : null;
}

/**
 * Sconto di retention (-50% a vita), offerto una sola volta prima che
 * l'agenzia completi la disdetta.
 *
 * `id` fisso invece di crearne uno nuovo a ogni chiamata: così due richieste
 * concorrenti convergono sullo stesso coupon anziché duplicarlo, e riaprire
 * il modale dopo un refresh non ne crea uno in più.
 */
const RETENTION_COUPON_ID = "retention-50-forever";
export const RETENTION_DISCOUNT_PERCENT_OFF = 50;

export async function getOrCreateRetentionCoupon(stripe: Stripe): Promise<string> {
  try {
    await stripe.coupons.retrieve(RETENTION_COUPON_ID);
  } catch {
    try {
      await stripe.coupons.create({
        id: RETENTION_COUPON_ID,
        percent_off: RETENTION_DISCOUNT_PERCENT_OFF,
        duration: "forever",
        name: "Offerta di retention -50%",
      });
    } catch (createError) {
      // Creato nel frattempo da una richiesta concorrente: il coupon esiste
      // comunque con l'id atteso, non è un errore da propagare.
      const alreadyExists =
        createError instanceof Stripe.errors.StripeInvalidRequestError &&
        createError.code === "resource_already_exists";
      if (!alreadyExists) throw createError;
    }
  }

  return RETENTION_COUPON_ID;
}

/**
 * Sconto del Programma Referral B2B per l'agenzia invitante (Referrer):
 * percentuale fissa, ricorrente per sempre, applicata solo alla sua
 * sottoscrizione. Niente somma per numero di referral attivi: un'agenzia con
 * più referral vede comunque un solo sconto, non un multiplo — è per questo
 * che qui serve un solo coupon, non uno per fascia.
 *
 * NOTA: questo sconto e quello di retention (`RETENTION_COUPON_ID`)
 * condividono lo stesso meccanismo Stripe (`subscriptions.update` con
 * `discounts: [...]`), che **sostituisce** qualsiasi sconto già presente
 * sull'abbonamento invece di sommarsi ad esso. Un'agenzia che avesse
 * entrambi attivi contemporaneamente vedrebbe applicato solo l'ultimo
 * impostato — riconciliare più sconti simultanei sullo stesso abbonamento è
 * fuori dallo scopo di questa modifica.
 */
const REFERRER_COUPON_ID = "referral-referrer-20-forever";

/** Come `getOrCreateRetentionCoupon`: un solo coupon, create on-demand, mai duplicato. */
export async function getOrCreateReferrerCoupon(stripe: Stripe): Promise<string> {
  try {
    await stripe.coupons.retrieve(REFERRER_COUPON_ID);
  } catch {
    try {
      await stripe.coupons.create({
        id: REFERRER_COUPON_ID,
        percent_off: REFERRER_DISCOUNT_PERCENT,
        duration: "forever",
        name: `Programma Referral: Invitante -${REFERRER_DISCOUNT_PERCENT}%`,
      });
    } catch (createError) {
      const alreadyExists =
        createError instanceof Stripe.errors.StripeInvalidRequestError &&
        createError.code === "resource_already_exists";
      if (!alreadyExists) throw createError;
    }
  }

  return REFERRER_COUPON_ID;
}

/**
 * Sconto di benvenuto del Programma Referral per l'agenzia invitata
 * (Referee): percentuale fissa, applicata **una sola volta**
 * (`duration: "once"`) alla sessione di Checkout del suo primo abbonamento a
 * pagamento — non un coupon ricorrente come quello dell'invitante, e non
 * applicato via `subscriptions.update` ma direttamente nei `discounts` della
 * Checkout Session (`app/api/stripe/checkout/route.ts`), l'unico punto in cui
 * esiste ancora un "primo" abbonamento da scontare.
 */
const REFEREE_COUPON_ID = "referral-referee-10-once";

export async function getOrCreateRefereeCoupon(stripe: Stripe): Promise<string> {
  try {
    await stripe.coupons.retrieve(REFEREE_COUPON_ID);
  } catch {
    try {
      await stripe.coupons.create({
        id: REFEREE_COUPON_ID,
        percent_off: REFEREE_WELCOME_DISCOUNT_PERCENT,
        duration: "once",
        name: `Programma Referral: Benvenuto -${REFEREE_WELCOME_DISCOUNT_PERCENT}%`,
      });
    } catch (createError) {
      const alreadyExists =
        createError instanceof Stripe.errors.StripeInvalidRequestError &&
        createError.code === "resource_already_exists";
      if (!alreadyExists) throw createError;
    }
  }

  return REFEREE_COUPON_ID;
}

/**
 * Il motivo scelto nel questionario di disdetta viaggia anche verso Stripe:
 * compare nel Dashboard sull'abbonamento cancellato, senza dover incrociare
 * manualmente i dati con il nostro database.
 */
export const CANCELLATION_REASON_TO_STRIPE_FEEDBACK: Record<
  CancellationReason,
  Stripe.SubscriptionUpdateParams.CancellationDetails.Feedback
> = {
  TOO_EXPENSIVE: "too_expensive",
  NOT_USED_ENOUGH: "unused",
  MISSING_FEATURES: "missing_features",
  CHOSE_ALTERNATIVE: "switched_service",
  OTHER: "other",
};
