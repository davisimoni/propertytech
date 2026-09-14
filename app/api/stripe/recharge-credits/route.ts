import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getExtraCreditsPriceId, getStripe, isStripeEnabled } from "@/lib/billing/stripe";
import { canRechargeCredits, EXTRA_CREDITS_PACK_SIZE } from "@/lib/plans";
import { getPlanId } from "@/lib/feature-access";
import { SITE_URL } from "@/lib/seo";

/**
 * Acquisto di un pacchetto di conversazioni WhatsApp aggiuntive.
 *
 * # Perché una rotta separata dal checkout dei piani
 *
 * Perché è un pagamento **una tantum** (`mode: "payment"`), non un
 * abbonamento: l'agenzia che esaurisce i crediti a metà mese compra cento
 * conversazioni e riparte, senza cambiare piano. Mescolare i due casi nella
 * stessa rotta avrebbe significato un ramo condizionale su ogni riga — dalla
 * modalità ai metadati agli URL di ritorno — dentro il codice che avvia i
 * pagamenti, che è l'ultimo posto dove si vogliono rami condizionali.
 *
 * I crediti li accredita il **webhook**, non questa rotta: qui il pagamento
 * non è ancora avvenuto. Vedi `checkout.session.completed`.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Un acquisto impegna l'agenzia: stessa regola di checkout, cancel e portale.
  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "forbidden", message: "Solo il titolare puo' acquistare crediti." },
      { status: 403 }
    );
  }

  const organizationId = session.user.organizationId;

  if (!isStripeEnabled()) {
    return NextResponse.json(
      { error: "stripe_not_configured", message: "I pagamenti non sono configurati su questo ambiente." },
      { status: 503 }
    );
  }

  const priceId = getExtraCreditsPriceId();
  if (!priceId) {
    return NextResponse.json(
      {
        error: "price_not_configured",
        message: "Il pacchetto crediti non è configurato su questo ambiente.",
      },
      { status: 503 }
    );
  }

  /*
   * In prova non si ricarica: si passa a un piano.
   *
   * Vendere cento conversazioni a chi sta valutando il prodotto significa
   * vendergli il pezzo sbagliato — e toglierli dal percorso che porta
   * all'abbonamento, che è ciò di cui ha davvero bisogno.
   */
  const planId = await getPlanId(organizationId);
  if (!canRechargeCredits(planId)) {
    return NextResponse.json(
      {
        error: "plan_not_eligible",
        message: "Durante la prova gratuita non si acquistano crediti: scegli un piano.",
      },
      { status: 400 }
    );
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { subscription: true },
  });

  if (!organization) {
    return NextResponse.json({ error: "organization_not_found" }, { status: 404 });
  }

  try {
    const stripe = getStripe();

    // Stesso criterio del checkout dei piani: si riusa il customer esistente,
    // così acquisti e abbonamento restano sotto un'unica anagrafica invece di
    // sparpagliarsi su duplicati che poi nessuno riesce a riconciliare.
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

    const checkoutSession = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        /*
         * I metadati sono l'unico canale verso il webhook, che non ha una
         * sessione utente. `type` distingue questa sessione da quelle di
         * abbonamento — senza, il webhook proverebbe ad attivare un piano che
         * qui non esiste. `credits` viaggia insieme perché il webhook accrediti
         * quanto è stato comprato *allora*, anche se un domani il pacchetto
         * cambiasse dimensione.
         */
        metadata: {
          type: "credit_recharge",
          organizationId,
          credits: String(EXTRA_CREDITS_PACK_SIZE),
        },
        success_url: `${SITE_URL}/settings?ricarica=ok`,
        cancel_url: `${SITE_URL}/settings?ricarica=annullata`,
        locale: "it",
      },
      // Doppio clic o ritentativo di rete non devono produrre due addebiti.
      { idempotencyKey: `recharge_${organizationId}_${Date.now()}` }
    );

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("[api/stripe/recharge-credits] Sessione non creata", { organizationId, error });
    return NextResponse.json(
      { error: "checkout_failed", message: "Non siamo riusciti ad avviare il pagamento. Riprova." },
      { status: 502 }
    );
  }
}
