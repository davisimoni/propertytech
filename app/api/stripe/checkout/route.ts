import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { conClienteValido } from "@/lib/billing/customer";
import { PLANS } from "@/lib/plans";
import {
  getOrCreateRefereeCoupon,
  getOverageLineItem,
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

  // Avviare un abbonamento impegna l'agenzia a pagare: `cancel` e `retention`
  // lo chiedevano gia', questa rotta no, e un collaboratore poteva far
  // partire un piano da 499 euro al mese.
  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "forbidden", message: "Solo il titolare puo' gestire l'abbonamento." },
      { status: 403 }
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

    const coupon = eligibleForWelcomeDiscount ? await getOrCreateRefereeCoupon(stripe) : null;

    // Enterprise mensile: la voce a consumo nasce con l'abbonamento, così le
    // conversazioni oltre l'incluso hanno dove essere fatturate dal primo
    // giorno. `null` sugli altri piani, sull'annuale e se il prezzo non è
    // configurato — vedi `getOverageLineItem`.
    const voceConsumo = getOverageLineItem(plan, interval);

    /*
     * Il cliente Stripe passa da `conClienteValido`.
     *
     * Un `stripeCustomerId` salvato può non esistere più sull'account — è il
     * caso di un id creato in ambiente test e ritrovato in live. Lì Stripe
     * risponde "No such customer" e l'agenzia resta bloccata davanti a un
     * errore che non può risolvere: l'helper azzera il riferimento, ne crea
     * uno nuovo e riprova una volta sola.
     */
    const checkoutSession = await conClienteValido(organizationId, (customerId, tentativo) =>
      stripe.checkout.sessions.create(
        {
          mode: "subscription",
          customer: customerId,
          line_items: [{ price: priceId, quantity: 1 }, ...(voceConsumo ? [voceConsumo] : [])],
          // I metadati sono l'unico canale affidabile per far arrivare al webhook
          // organizzazione e piano: il webhook non ha una sessione utente.
          metadata: { organizationId, planId: plan, interval },
          subscription_data: { metadata: { organizationId, planId: plan, interval } },
          success_url: `${SITE_URL}/settings?checkout=success`,
          cancel_url: `${SITE_URL}/settings?checkout=cancelled`,
          locale: "it",
          /*
           * Sconto automatico **oppure** campo per il codice promozionale, mai
           * tutti e due: Stripe rifiuta una sessione che dichiari insieme
           * `discounts` e `allow_promotion_codes` ("You may only specify one
           * of these parameters"). La precedenza va allo sconto di benvenuto
           * del referral perché è già maturato e vale una volta sola: farlo
           * saltare per mostrare un campo vuoto toglierebbe all'agenzia
           * qualcosa che le spetta.
           */
          ...(coupon ? { discounts: [{ coupon }] } : { allow_promotion_codes: true }),
        },
        // Evita doppi addebiti se l'utente fa doppio clic o la rete ritenta.
        // `tentativo` fa parte della chiave: al secondo giro ne serve una
        // diversa, o Stripe restituirebbe la risposta memorizzata del primo —
        // cioè proprio l'errore da cui stiamo uscendo.
        {
          idempotencyKey: `checkout_${organizationId}_${plan}_${interval}_${Date.now()}_${tentativo}`,
        }
      )
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
