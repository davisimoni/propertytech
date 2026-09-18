import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getExtraCreditsPriceId, getStripe, isStripeEnabled } from "@/lib/billing/stripe";
import { conClienteValido } from "@/lib/billing/customer";
import { isOverageBillingActive } from "@/lib/billing/overage";
import { canRechargeCredits, EXTRA_CREDITS_PACK_SIZE, hasMeteredOverage } from "@/lib/plans";
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

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { subscription: true },
  });

  if (!organization) {
    return NextResponse.json({ error: "organization_not_found" }, { status: 404 });
  }

  /*
   * Chi può ricaricare lo decide `canRechargeCredits`, la stessa regola che
   * mostra o nasconde il pulsante: Starter e Professional sempre, Enterprise
   * solo senza consumo a pagamento attivo (annuale, beta tester), Trial mai.
   * Il pulsante non compare dove la risposta è no; questo controllo copre chi
   * chiama la rotta direttamente.
   */
  const planId = await getPlanId(organizationId);
  const overageActive = isOverageBillingActive(organization.subscription);
  if (!canRechargeCredits(planId, overageActive)) {
    return NextResponse.json(
      {
        error: "plan_not_eligible",
        message: hasMeteredOverage(planId)
          ? "Il tuo piano Enterprise prosegue a consumo oltre le conversazioni incluse: non serve acquistare crediti."
          : "Durante la prova gratuita non si acquistano crediti: scegli un piano.",
      },
      { status: 400 }
    );
  }

  try {
    const stripe = getStripe();

    /*
     * Stesso criterio del checkout dei piani: il cliente si riusa fra un
     * acquisto e l'altro, e `conClienteValido` lo rigenera se l'id salvato non
     * esiste più sull'account Stripe (tipico di un id creato in test e
     * ritrovato in live).
     */
    const checkoutSession = await conClienteValido(organizationId, (customerId, tentativo) =>
      stripe.checkout.sessions.create(
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
          /*
           * Nessun campo per i codici promozionali su questo acquisto.
           *
           * I codici in circolazione scontano l'abbonamento, e quello attivo
           * vale il 50% per sempre: senza restrizioni di prodotto sul coupon,
           * Stripe lo avrebbe applicato anche qui, dimezzando un pacchetto di
           * crediti e consumando uno dei riscatti destinati ai piani. La
           * decisione sta qui e non in una restrizione sul coupon perché vale
           * per qualunque codice, compresi quelli creati domani dalla
           * dashboard.
           */
        },
        // Doppio clic o ritentativo di rete non devono produrre due addebiti.
        // `tentativo` nella chiave: al secondo giro ne serve una diversa.
        { idempotencyKey: `recharge_${organizationId}_${Date.now()}_${tentativo}` }
      )
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
