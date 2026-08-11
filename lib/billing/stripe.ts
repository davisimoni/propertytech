import "server-only";
import Stripe from "stripe";
import type { CancellationReason } from "@prisma/client";
import type { BillingInterval, PlanId } from "@/lib/plans";
import { isConfiguredSecret, readSecret } from "@/lib/env";
export { isCancellationReason } from "@/lib/billing/cancellation";

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
