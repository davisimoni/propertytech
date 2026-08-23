import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/plans";
import {
  getOrCreateRefereeCoupon,
  getPriceId,
  getStripe,
  isBillingInterval,
  isPaidPlanId,
  isStripeEnabled,
} from "@/lib/billing/stripe";
import { SITE_URL } from "@/lib/seo";

const checkoutSchema = z.object({
  plan: z.string().refine(isPaidPlanId, "Piano non valido"),
  // Assente nelle chiamate precedenti all'introduzione dell'annuale: si
  // assume il mensile, come prima.
  interval: z.string().refine(isBillingInterval, "Intervallo non valido").default("monthly"),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isStripeEnabled()) {
    return NextResponse.json(
      {
        error: "stripe_not_configured",
        message: "I pagamenti non sono ancora attivi su questo ambiente.",
      },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }

  const { plan, interval } = parsed.data;
  const priceId = getPriceId(plan, interval);

  if (!priceId) {
    const intervalLabel = interval === "yearly" ? "annuale" : "mensile";
    return NextResponse.json(
      {
        error: "price_not_configured",
        message: `Il piano ${PLANS[plan].name} con fatturazione ${intervalLabel} non è al momento acquistabile.`,
      },
      { status: 503 }
    );
  }

  const organizationId = session.user.organizationId;

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { subscription: true },
  });

  if (!organization) {
    return NextResponse.json({ error: "organization_not_found" }, { status: 404 });
  }

  try {
    const stripe = getStripe();

    // Riusa il customer esistente, così i pagamenti successivi restano
    // aggregati sotto la stessa anagrafica anziché creare duplicati.
    let customerId = organization.subscription?.stripeCustomerId ?? undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: organization.email,
        name: organization.agencyName,
        metadata: { organizationId },
      });
      customerId = customer.id;

      await prisma.subscription.update({
        where: { organizationId },
        data: { stripeCustomerId: customerId },
      });
    }

    // Sconto di benvenuto del Programma Referral: solo se questa
    // organizzazione è un'invitata e non l'ha già consumato (una tantum, per
    // sempre — vedi `Referral.refereeWelcomeDiscountAppliedAt`). Applicato
    // qui e non con `subscriptions.update` dopo il webhook perché è l'unico
    // punto in cui esiste ancora un "primo" abbonamento da scontare: il
    // coupon Stripe ha `duration: "once"`, quindi vale solo per la prima
    // fattura di questo abbonamento.
    const referral = await prisma.referral.findUnique({
      where: { refereeId: organizationId },
      select: { refereeWelcomeDiscountAppliedAt: true },
    });
    const eligibleForWelcomeDiscount = referral !== null && !referral.refereeWelcomeDiscountAppliedAt;

    const checkoutSession = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        // I metadati sono l'unico canale affidabile per far arrivare al webhook
        // organizzazione e piano: il webhook non ha una sessione utente.
        metadata: { organizationId, planId: plan, interval },
        subscription_data: { metadata: { organizationId, planId: plan, interval } },
        success_url: `${SITE_URL}/settings?checkout=success`,
        cancel_url: `${SITE_URL}/settings?checkout=cancelled`,
        locale: "it",
        ...(eligibleForWelcomeDiscount && {
          discounts: [{ coupon: await getOrCreateRefereeCoupon(stripe) }],
        }),
      },
      // Evita doppi addebiti se l'utente fa doppio clic o la rete ritenta.
      { idempotencyKey: `checkout_${organizationId}_${plan}_${interval}_${Date.now()}` }
    );

    if (!checkoutSession.url) {
      return NextResponse.json({ error: "checkout_url_missing" }, { status: 502 });
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("[api/stripe/checkout] Checkout session creation failed", error);
    return NextResponse.json(
      { error: "checkout_failed", message: "Impossibile avviare il pagamento. Riprova." },
      { status: 502 }
    );
  }
}
