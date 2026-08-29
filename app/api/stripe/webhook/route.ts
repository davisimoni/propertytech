import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeEnabled, readPlanFromMetadata } from "@/lib/billing/stripe";
import { readSecret } from "@/lib/env";
import { activateRefereeReferral, expireRefereeReferral } from "@/lib/referrals/lifecycle";
import {
  notifyPaymentFailed,
  notifyPlanActivated,
  notifyRenewalPaid,
  notifySubscriptionCancelled,
} from "@/lib/notifications/billing";
import { PLANS, type PlanId } from "@/lib/plans";

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
  // Piano precedente, letto PRIMA della scrittura: e' l'unico modo di sapere
  // se questo e' un primo acquisto o un passaggio fra piani gia' a pagamento,
  // e i due casi meritano due email diverse.
  const precedente = await prisma.subscription.findUnique({
    where: { organizationId },
    select: { status: true },
  });

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
      data: {
        whatsappCreditsUsed: 0,
        docCreditsUsed: 0,
        voiceCreditsUsed: 0,
        // Anche la memoria degli avvisi di soglia riparte: senza, chi ha gia'
        // ricevuto l'avviso del 90% il mese scorso non lo riceverebbe piu'.
        whatsappNotifiedPct: 0,
        docNotifiedPct: 0,
        voiceNotifiedPct: 0,
      },
    }),
  ]);

  // Se questa organizzazione è un'invitata del Programma Referral, il primo
  // pagamento a buon fine è il momento in cui il referral diventa ACTIVE e lo
  // sconto ricorrente dell'invitante va applicato (lo sconto di benvenuto
  // dell'invitata, invece, è già stato applicato al Checkout). Fuori dalla
  // transazione: non deve far fallire l'attivazione del piano se qualcosa va
  // storto qui.
  await activateRefereeReferral(organizationId);

  // Fuori dalla transazione e non bloccante, come il referral: questa rotta
  // risponde 500 per far ritentare Stripe, e un errore di posta farebbe
  // ripetere l'attivazione dell'intero piano.
  await notifyPlanActivated({
    organizationId,
    previousPlan: (precedente?.status ?? "trial") as PlanId,
    newPlan: planId,
  });
}

/** Riporta l'organizzazione al piano Trial quando l'abbonamento cessa. */
async function downgradeToTrial(stripeSubscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
    select: { organizationId: true },
  });

  if (!subscription) return;

  const precedente = await prisma.subscription.findUnique({
    where: { organizationId: subscription.organizationId },
    select: { status: true, currentPeriodEnd: true },
  });

  await prisma.subscription.update({
    where: { organizationId: subscription.organizationId },
    // La disdetta, se c'era, ha appena avuto effetto: non è più "in corso".
    data: { status: "trial", cancelAtPeriodEnd: false, currentPeriodEnd: null },
  });

  // Simmetrico ad `activatePlan`: se questa organizzazione era un'invitata
  // con un referral ACTIVE, non è più un'agenzia a pagamento e il referral
  // scade — lo sconto ricorrente dell'invitante va ricalcolato di
  // conseguenza. Lo sconto di benvenuto già consumato dall'invitata resta
  // tale: non si riattiva a un'eventuale disdetta.
  await expireRefereeReferral(subscription.organizationId);

  await notifySubscriptionCancelled({
    organizationId: subscription.organizationId,
    planName: PLANS[(precedente?.status ?? "trial") as PlanId].name,
    activeUntil: precedente?.currentPeriodEnd,
  });
}

/**
 * Sincronizza lo stato di disdetta dall'abbonamento Stripe.
 *
 * `cancel_at_period_end` non cambia lo `status` dell'abbonamento — resta
 * "active" fino alla fine del periodo pagato — quindi va letto qui a parte,
 * indipendentemente dal ramo che gestisce l'attivazione del piano. Serve
 * anche a restare corretti se la disdetta parte dal portale clienti di
 * Stripe invece che dalla nostra UI.
 */
async function syncCancellationState(organizationId: string, subscription: Stripe.Subscription) {
  const periodEndSeconds = subscription.items.data[0]?.current_period_end;

  await prisma.subscription.update({
    where: { organizationId },
    data: {
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: periodEndSeconds ? new Date(periodEndSeconds * 1000) : null,
    },
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
          await syncCancellationState(organizationId, subscription);
        } else if (subscription.status === "canceled" || subscription.status === "unpaid") {
          await downgradeToTrial(subscription.id);
        }
        break;
      }

      case "customer.subscription.deleted": {
        await downgradeToTrial(event.data.object.id);
        break;
      }

      /**
       * Rinnovo rifiutato.
       *
       * Non tocca lo stato dell'abbonamento - a farlo e' Stripe con i suoi
       * tentativi, e solo alla fine con `subscription.updated` - ma e'
       * l'unico momento in cui possiamo avvisare in tempo. Senza questa
       * email l'agenzia scopre la carta scaduta dai lead che non ricevono
       * piu' risposta.
       */
      /**
       * Rinnovo incassato.
       *
       * Si spedisce solo per le fatture di RINNOVO, non per la prima: al
       * primo pagamento parte gia' l'email di attivazione da
       * `checkout.session.completed`, e riceverne due nello stesso minuto per
       * lo stesso addebito sembra un errore di fatturazione.
       */
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        if (invoice.billing_reason !== "subscription_cycle") break;

        const dettagliOk = invoice.parent?.subscription_details;
        const idAbbonamento =
          typeof dettagliOk?.subscription === "string" ? dettagliOk.subscription : null;
        if (!idAbbonamento) break;

        const abbonamento = await prisma.subscription.findUnique({
          where: { stripeSubscriptionId: idAbbonamento },
          select: { organizationId: true, status: true, currentPeriodEnd: true },
        });
        if (!abbonamento) break;

        await notifyRenewalPaid({
          organizationId: abbonamento.organizationId,
          planId: abbonamento.status as PlanId,
          amountLabel: invoice.amount_paid
            ? `${(invoice.amount_paid / 100).toFixed(2)} ${invoice.currency?.toUpperCase() ?? "EUR"}`
            : "importo del rinnovo",
          periodEnd: abbonamento.currentPeriodEnd,
          invoiceUrl: invoice.hosted_invoice_url,
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;

        // Dalla versione 2025 dell'API il riferimento all'abbonamento non sta
        // piu' su `invoice.subscription` ma sotto `parent.subscription_details`.
        // Una fattura senza questo blocco non nasce da un abbonamento (una
        // nota di credito, un pagamento una tantum) e qui non ci riguarda.
        const dettagli = invoice.parent?.subscription_details;
        const stripeSubscriptionId =
          typeof dettagli?.subscription === "string" ? dettagli.subscription : null;

        if (!stripeSubscriptionId) break;

        const subscription = await prisma.subscription.findUnique({
          where: { stripeSubscriptionId },
          select: { organizationId: true, status: true },
        });

        if (!subscription) break;

        await notifyPaymentFailed({
          organizationId: subscription.organizationId,
          planId: subscription.status as PlanId,
          amountLabel: invoice.amount_due
            ? `${(invoice.amount_due / 100).toFixed(2)} ${invoice.currency?.toUpperCase() ?? "EUR"}`
            : "importo del rinnovo",
          updateUrl: invoice.hosted_invoice_url,
        });
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
