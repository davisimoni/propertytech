import "server-only";
import Stripe from "stripe";
import type { BillingInterval, PlanId } from "@/lib/plans";
import { isConfiguredSecret, readSecret } from "@/lib/env";

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
