import { NextResponse } from "next/server";
import type Stripe from "stripe";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { accreditaRicarica } from "@/lib/billing/credit-recharge";
import { syncOverageItem } from "@/lib/billing/overage";
import {
  getExtraSeatPriceId,
  getStripe,
  isStripeEnabled,
  readPlanFromMetadata,
} from "@/lib/billing/stripe";
import { readSecret } from "@/lib/env";
import { reportWebhookError } from "@/lib/observability/report-error";
import { activateRefereeReferral, expireRefereeReferral } from "@/lib/referrals/lifecycle";
import {
  notifyPaymentFailed,
  notifyPlanActivated,
  notifyRenewalPaid,
  notifySubscriptionCancelled,
} from "@/lib/notifications/billing";
import { PLANS, type PlanId } from "@/lib/plans";
import { datiCambioPiano } from "@/lib/billing/usage-period";

/** Ancora del ciclo di un abbonamento Stripe, da secondi a data. */
function ancoraDi(subscription: Stripe.Subscription | null): Date | null {
  return subscription?.billing_cycle_anchor
    ? new Date(subscription.billing_cycle_anchor * 1000)
    : null;
}

/**
 * Attiva il piano acquistato e registra l'ancora del ciclo.
 *
 * # Quando si azzerano i contatori
 *
 * Solo al **cambio di piano**: il nuovo piano parte con la dotazione piena.
 * Non a ogni `customer.subscription.updated`, che arriva anche per una
 * disdetta programmata o una postazione in più: prima ogni evento azzerava
 * tutto e regalava una dotazione intera a metà mese. I rinnovi mensili non
 * passano più di qui: il mese lo chiude `assicuraPeriodoCorrente` al primo
 * accesso dopo la scadenza calcolata dall'ancora, anche sull'annuale.
 *
 * Idempotente: una seconda consegna dello stesso evento trova il piano già
 * applicato e non azzera nulla.
 */
async function activatePlan(
  organizationId: string,
  planId: "starter" | "pro" | "enterprise",
  stripeSubscriptionId: string | null,
  stripeCustomerId: string | null,
  ancoraStripe: Date | null
) {
  // Piano precedente, letto PRIMA della scrittura: e' l'unico modo di sapere
  // se questo e' un primo acquisto o un passaggio fra piani gia' a pagamento,
  // e i due casi meritano due email diverse.
  const precedente = await prisma.subscription.findUnique({
    where: { organizationId },
    select: {
      status: true,
      billingCycleAnchor: true,
      organization: {
        select: {
          bonusWhatsappCredits: true,
          usageTracker: { select: { whatsappCreditsUsed: true } },
        },
      },
    },
  });

  const pianoPrecedente = (precedente?.status ?? "trial") as PlanId;
  const adesso = new Date();
  // Stripe è la fonte; senza (lettura dell'abbonamento fallita) si tiene
  // l'ancora già nota, e solo in mancanza di entrambe si parte da adesso.
  const ancora = ancoraStripe ?? precedente?.billingCycleAnchor ?? adesso;

  const scritture: Prisma.PrismaPromise<unknown>[] = [
    prisma.subscription.update({
      where: { organizationId },
      data: {
        status: planId,
        billingCycleAnchor: ancora,
        ...(stripeSubscriptionId && { stripeSubscriptionId }),
        ...(stripeCustomerId && { stripeCustomerId }),
      },
    }),
  ];

  if (pianoPrecedente !== planId) {
    const { tracker, bonusDaScalare } = datiCambioPiano({
      pianoPrecedente,
      usatiWhatsapp: precedente?.organization.usageTracker?.whatsappCreditsUsed ?? 0,
      bonus: precedente?.organization.bonusWhatsappCredits ?? 0,
      ancora,
      adesso,
    });
    scritture.push(prisma.usageTracker.update({ where: { organizationId }, data: tracker }));
    if (bonusDaScalare > 0) {
      scritture.push(
        prisma.organization.update({
          where: { id: organizationId },
          data: { bonusWhatsappCredits: { decrement: bonusDaScalare } },
        })
      );
    }
  }

  await prisma.$transaction(scritture);

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

/**
 * Riallinea le postazioni acquistate con quelle che l'agenzia paga davvero.
 *
 * # Perche' Stripe comanda
 *
 * Perche' e' li' che si decide quanto si paga. La quantita' puo' cambiare
 * anche fuori dalla nostra rotta — dal portale clienti di Stripe, da una
 * correzione fatta a mano in dashboard, da un pagamento fallito che sospende
 * una voce — e in tutti quei casi il nostro `extraSeats` resterebbe fermo su
 * un numero che nessuno sta piu' pagando.
 *
 * Nella direzione sbagliata l'errore costa: un `extraSeats` locale piu' alto
 * di quello fatturato significa postazioni regalate, e nessuno se ne accorge
 * finche' non si guardano i conti.
 *
 * Non lancia: un abbonamento appena attivato non deve fallire per un
 * riallineamento di postazioni, e il prossimo evento ripassa comunque di qui.
 */
async function syncExtraSeats(
  organizationId: string,
  subscription: Stripe.Subscription
): Promise<void> {
  const priceId = getExtraSeatPriceId();
  if (!priceId) return;

  try {
    const voce = subscription.items.data.find((item) => item.price.id === priceId);
    const quantita = voce?.quantity ?? 0;

    await prisma.organization.update({
      where: { id: organizationId },
      data: { extraSeats: quantita },
    });

    console.info("[BILLING-SEATS-SYNC]", { organizationId, extraSeats: quantita });
  } catch (error) {
    // Effetto collaterale non bloccante, quindi invisibile: l'agenzia paga per
    // N postazioni e ne ha un numero diverso, e nessuno se ne accorge.
    reportWebhookError(error, "stripe", "seats-sync");
    console.error("[api/stripe/webhook] Riallineamento postazioni non riuscito", {
      organizationId,
      error,
    });
  }
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

        /*
         * Ricarica crediti: si riconosce dai metadati e si gestisce prima.
         *
         * Una sessione di ricarica non porta un `planId`, quindi senza questo
         * ramo finirebbe nell'errore "metadati mancanti" qui sotto e i crediti
         * pagati non verrebbero mai accreditati.
         */
        if (session.metadata?.type === "credit_recharge") {
          await accreditaRicarica(session);
          break;
        }

        const planId = readPlanFromMetadata(session.metadata);

        if (!organizationId || !planId) {
          console.error("[api/stripe/webhook] Metadati mancanti sulla sessione", {
            sessionId: session.id,
          });
          break;
        }

        const idAbbonamento = typeof session.subscription === "string" ? session.subscription : null;

        /*
         * L'abbonamento si rilegge: la sessione di Checkout non porta né
         * l'ancora del ciclo né le voci. Senza, l'ancora partirebbe da adesso
         * invece che da quella di Stripe, e un Enterprise appena acquistato
         * resterebbe fermo al limite fino al primo `subscription.updated`, che
         * su un mensile arriva al rinnovo.
         *
         * Non bloccante: rispondere 500 farebbe ripetere l'intera attivazione
         * del piano per due dati che il prossimo evento riallinea comunque.
         */
        let abbonamento: Stripe.Subscription | null = null;
        if (idAbbonamento) {
          try {
            abbonamento = await getStripe().subscriptions.retrieve(idAbbonamento);
          } catch (error) {
            reportWebhookError(error, "stripe", "subscription-retrieve");
            console.error("[api/stripe/webhook] Lettura abbonamento dopo il Checkout non riuscita", {
              organizationId,
              error,
            });
          }
        }

        await activatePlan(
          organizationId,
          planId,
          idAbbonamento,
          typeof session.customer === "string" ? session.customer : null,
          ancoraDi(abbonamento)
        );

        if (abbonamento) {
          await syncOverageItem(organizationId, abbonamento, planId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const organizationId = subscription.metadata?.organizationId;
        const planId = readPlanFromMetadata(subscription.metadata);

        // Un abbonamento sospeso per mancato pagamento non deve mantenere
        // attivo il piano.
        if (organizationId && planId && subscription.status === "active") {
          await activatePlan(organizationId, planId, subscription.id, null, ancoraDi(subscription));
          await syncCancellationState(organizationId, subscription);
          await syncExtraSeats(organizationId, subscription);
          // Copre il cambio di piano fatto fuori dal Checkout (portale Stripe).
          await syncOverageItem(organizationId, subscription, planId);
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
    /*
     * Il guasto più costoso della piattaforma, e finora il più silenzioso.
     *
     * Qui è già arrivato un evento di pagamento e non siamo riusciti a
     * registrarlo: lo stato dell'abbonamento diverge da quello che il cliente
     * ha pagato. Stripe ritenta, quindi spesso si ricuce da solo — ma se non
     * si ricuce nessuno lo scopre, perché dall'altro capo non c'è una persona
     * davanti a una schermata. L'etichetta porta il tipo di evento, che è la
     * prima cosa da sapere e non è un dato personale.
     */
    reportWebhookError(error, "stripe", event.type);
    console.error("[api/stripe/webhook] Handler failed", { type: event.type, error });
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
