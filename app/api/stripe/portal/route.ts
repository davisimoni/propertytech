import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeEnabled } from "@/lib/billing/stripe";
import { SITE_URL } from "@/lib/seo";

/**
 * Portale clienti Stripe: fatture, metodo di pagamento, dati di fatturazione.
 *
 * # Perché una sessione e non un link fisso
 *
 * Perché l'indirizzo del portale è legato al singolo cliente e scade: Stripe
 * lo emette su richiesta, autenticando lui la persona. Un URL memorizzato da
 * qualche parte sarebbe un accesso ai dati di fatturazione di un'agenzia
 * valido per chiunque lo trovasse.
 *
 * # Perché solo il titolare
 *
 * Stessa regola di `cancel` e `checkout`: dal portale si cambia la carta e si
 * scaricano le fatture dell'agenzia. Un collaboratore ha accesso al prodotto,
 * non alla contabilità di chi lo paga.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "forbidden", message: "Solo il titolare può gestire la fatturazione." },
      { status: 403 }
    );
  }

  if (!isStripeEnabled()) {
    return NextResponse.json(
      {
        error: "stripe_disabled",
        message: "La fatturazione non è configurata su questo ambiente.",
      },
      { status: 503 }
    );
  }

  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: session.user.organizationId },
    select: { stripeCustomerId: true },
  });

  /*
   * Senza `stripeCustomerId` non c'è niente da mostrare: il cliente su Stripe
   * nasce al primo checkout. Chi è ancora in prova non ha fatture né un
   * metodo di pagamento, e mandarlo a un portale vuoto sembrerebbe un guasto.
   */
  if (!subscription?.stripeCustomerId) {
    return NextResponse.json(
      {
        error: "no_customer",
        message:
          "Non risulta ancora nessun pagamento: le fatture compaiono qui dopo il primo rinnovo.",
      },
      { status: 400 }
    );
  }

  try {
    const stripe = getStripe();
    const portale = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${SITE_URL}/settings`,
    });

    return NextResponse.json({ url: portale.url });
  } catch (error) {
    console.error("[api/stripe/portal] Creazione sessione portale fallita", error);
    return NextResponse.json(
      {
        error: "portal_failed",
        message: "Non siamo riusciti ad aprire la gestione fatture. Riprova fra poco.",
      },
      { status: 502 }
    );
  }
}
