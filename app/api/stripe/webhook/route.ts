import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeEnabled, readPlanFromMetadata } from "@/lib/billing/stripe";
import { readSecret } from "@/lib/env";

/**
 * Attiva il piano acquistato e azzera i contatori di consumo.
 *
 * Scritto come operazione idempotente: Stripe può recapitare lo stesso evento
 * più volte, e riapplicare lo stesso piano non deve moltiplicare i crediti.
 */
async function activatePlan(
  organizationId: string,
  planId: "starter" | "pro" | "enterprise",
  stripeSubscriptionId: string | null,
  stripeCustomerId: string | null
) {
  await prisma.$transaction([
    prisma.subscription.update({
      where: { organizationId },
      data: {
        status: planId,
        ...(stripeSubscriptionId && { stripeSubscriptionId }),
        ...(stripeCustomerId && { stripeCustomerId }),
      },
    }),
    // Il nuovo piano parte con la dotazione piena: i crediti consumati durante
    // il periodo precedente non vanno scalati da quelli appena acquistati.
    prisma.usageTracker.update({
      where: { organizationId },
      data: { whatsappCreditsUsed: 0, docCreditsUsed: 0, voiceCreditsUsed: 0 },
    }),
  ]);
}

/** Riporta l'organizzazione al piano Trial quando l'abbonamento cessa. */
async function downgradeToTrial(stripeSubscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
    select: { organizationId: true },
  });

  if (!subscription) return;

  await prisma.subscription.update({
    where: { organizationId: subscription.organizationId },
    data: { status: "trial" },
  });
}

export async function POST(request: Request) {
  if (!isStripeEnabled()) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }

  const webhookSecret = readSecret("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("[api/stripe/webhook] STRIPE_WEBHOOK_SECRET non configurato");
    return NextResponse.json({ error: "webhook_secret_missing" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  // La firma va verificata sul corpo grezzo: qualsiasi parsing JSON
  // intermedio ne altera i byte e invalida il controllo.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    // Firma non valida: la richiesta non proviene da Stripe.
    console.error("[api/stripe/webhook] Signature verification failed", error);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const organizationId = session.metadata?.organizationId;
        const planId = readPlanFromMetadata(session.metadata);

        if (!organizationId || !planId) {
          console.error("[api/stripe/webhook] Metadati mancanti sulla sessione", {
            sessionId: session.id,
          });
          break;
        }

        await activatePlan(
          organizationId,
          planId,
          typeof session.subscription === "string" ? session.subscription : null,
          typeof session.customer === "string" ? session.customer : null
        );
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const organizationId = subscription.metadata?.organizationId;
        const planId = readPlanFromMetadata(subscription.metadata);

        // Un abbonamento sospeso per mancato pagamento non deve mantenere
        // attivo il piano.
        if (organizationId && planId && subscription.status === "active") {
          await activatePlan(organizationId, planId, subscription.id, null);
        } else if (subscription.status === "canceled" || subscription.status === "unpaid") {
          await downgradeToTrial(subscription.id);
        }
        break;
      }

      case "customer.subscription.deleted": {
        await downgradeToTrial(event.data.object.id);
        break;
      }

      default:
        // Gli altri eventi non modificano lo stato dell'abbonamento.
        break;
    }
  } catch (error) {
    // Un 500 fa ritentare Stripe: corretto per un errore transitorio del
    // database, dato che le operazioni sono idempotenti.
    console.error("[api/stripe/webhook] Handler failed", { type: event.type, error });
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
