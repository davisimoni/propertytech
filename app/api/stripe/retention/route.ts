import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateRetentionCoupon, getStripe, isStripeEnabled, RETENTION_DISCOUNT_PERCENT_OFF } from "@/lib/billing/stripe";

/**
 * Applica lo sconto di retention (-50% a vita) all'abbonamento in corso,
 * offerto una sola volta nel primo modale del flusso di disdetta.
 *
 * Senza Stripe configurato non c'è un abbonamento reale da scontare: la
 * chiamata a Stripe viene saltata e l'esito è marcato `mocked`, ma lo stato
 * lato nostro database viene comunque aggiornato — è il fallback di sviluppo
 * richiesto, pensato per sparire da solo non appena le chiavi Stripe
 * arriveranno in `.env.local` (`isStripeEnabled()` tornerà `true`).
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "forbidden", message: "Solo il titolare può gestire l'abbonamento." },
      { status: 403 }
    );
  }

  const organizationId = session.user.organizationId;

  const subscription = await prisma.subscription.findUnique({ where: { organizationId } });

  if (!subscription || subscription.status === "trial") {
    return NextResponse.json(
      {
        error: "no_active_subscription",
        message: "L'offerta è disponibile solo per chi ha già un abbonamento a pagamento.",
      },
      { status: 400 }
    );
  }

  let mocked = false;

  if (isStripeEnabled() && subscription.stripeSubscriptionId) {
    try {
      const stripe = getStripe();
      const couponId = await getOrCreateRetentionCoupon(stripe);

      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        discounts: [{ coupon: couponId }],
      });
    } catch (error) {
      console.error("[api/stripe/retention] Applicazione sconto fallita", error);
      return NextResponse.json(
        {
          error: "retention_discount_failed",
          message: "Non siamo riusciti ad applicare lo sconto. Riprova tra qualche minuto.",
        },
        { status: 502 }
      );
    }
  } else {
    // Stripe non configurato (o abbonamento senza id Stripe, tipico dei dati
    // di sviluppo): non c'è nulla da scontare per davvero.
    mocked = true;
    console.warn(
      "[api/stripe/retention] Stripe non configurato: sconto simulato solo lato database",
      { organizationId }
    );
  }

  await prisma.subscription.update({
    where: { organizationId },
    data: { retentionDiscountAppliedAt: new Date() },
  });

  return NextResponse.json({ ok: true, mocked, discountPercent: RETENTION_DISCOUNT_PERCENT_OFF });
}
