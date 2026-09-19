import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { accreditaRicarica } from "@/lib/billing/credit-recharge";
import { syncOverageItem } from "@/lib/billing/overage";
import {
  getExtraSeatPriceId,
  getStripe,
  isStripeEnabled,
  pianoDaAbbonamento,
  readPlanFromMetadata,
  type PianoDaPrezzo,
} from "@/lib/billing/stripe";
import { readSecret } from "@/lib/env";
import { reportWebhookError } from "@/lib/observability/report-error";
import { activateRefereeReferral, expireRefereeReferral } from "@/lib/referrals/lifecycle";
import {
  notifyPaymentFailed,
  notifyPlanActivated,
  notifyRenewalPaid,
  notifySeatsOverLimit,
  notifySubscriptionCancelled,
} from "@/lib/notifications/billing";
import { getSeatAccounting } from "@/lib/billing/seats";
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
 *
 * # Perché il cambio di piano è una scrittura condizionata
 *
 * Perché lo stesso abbonamento arriva da due eventi quasi simultanei:
 * `checkout.session.completed` e `customer.subscription.created`. Letti in
 * parallelo, entrambi vedevano ancora "trial" ed entrambi applicavano il
 * cambio: contatori azzerati due volte, crediti bonus scalati due volte, due
 * email di benvenuto. Ora il nuovo piano si scrive solo **se il piano è
 * ancora quello letto** (`updateMany` con lo stato atteso): Postgres ricontrolla
 * la condizione dopo aver atteso il lock della riga, quindi dei due arrivi
 * uno solo trova la riga ancora da cambiare, e solo quello applica gli effetti.
 */
async function activatePlan(
  organizationId: string,
  planId: "starter" | "pro" | "enterprise",
  stripeSubscriptionId: string | null,
  stripeCustomerId: string | null,
  ancoraStripe: Date | null
) {
  const adesso = new Date();

  const esito = await prisma.$transaction(async (tx) => {
    // Piano precedente, letto PRIMA della scrittura: e' l'unico modo di sapere
    // se questo e' un primo acquisto o un passaggio fra piani gia' a pagamento,
    // e i due casi meritano due email diverse.
    const precedente = await tx.subscription.findUnique({
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

    // Ogni agenzia ha la sua riga dalla registrazione. Se manca, si fallisce:
    // la risposta 500 fa ritentare Stripe, mentre la scrittura condizionata qui
    // sotto su una riga inesistente non cambierebbe nulla, in silenzio, e un
    // piano pagato resterebbe spento senza che nessuno lo sappia.
    if (!precedente) {
      throw new Error(`Abbonamento locale assente per l'organizzazione ${organizationId}`);
    }

    const pianoPrecedente = precedente.status as PlanId;
    // Stripe è la fonte; senza (lettura dell'abbonamento fallita) si tiene
    // l'ancora già nota, e solo in mancanza di entrambe si parte da adesso.
    const ancora = ancoraStripe ?? precedente.billingCycleAnchor ?? adesso;

    const scritto = await tx.subscription.updateMany({
      where: { organizationId, status: pianoPrecedente },
      data: {
        status: planId,
        billingCycleAnchor: ancora,
        ...(stripeSubscriptionId && { stripeSubscriptionId }),
        ...(stripeCustomerId && { stripeCustomerId }),
      },
    });

    // Un'altra consegna ha cambiato il piano fra la lettura e la scrittura:
    // gli effetti del cambio li ha gia' applicati lei.
    const cambiato = scritto.count === 1 && pianoPrecedente !== planId;

    if (cambiato) {
      const { tracker, bonusDaScalare } = datiCambioPiano({
        pianoPrecedente,
        usatiWhatsapp: precedente.organization.usageTracker?.whatsappCreditsUsed ?? 0,
        bonus: precedente.organization.bonusWhatsappCredits,
        ancora,
        adesso,
      });
      await tx.usageTracker.update({ where: { organizationId }, data: tracker });
      if (bonusDaScalare > 0) {
        await tx.organization.update({
          where: { id: organizationId },
          data: { bonusWhatsappCredits: { decrement: bonusDaScalare } },
        });
      }
    }

    return { cambiato, pianoPrecedente };
  });

  // Se questa organizzazione è un'invitata del Programma Referral, il primo
  // pagamento a buon fine è il momento in cui il referral diventa ACTIVE e lo
  // sconto ricorrente dell'invitante va applicato (lo sconto di benvenuto
  // dell'invitata, invece, è già stato applicato al Checkout). Fuori dalla
  // transazione: non deve far fallire l'attivazione del piano se qualcosa va
  // storto qui.
  await activateRefereeReferral(organizationId);

  // Fuori dalla transazione e non bloccante, come il referral: questa rotta
  // risponde 500 per far ritentare Stripe, e un errore di posta farebbe
  // ripetere l'attivazione dell'intero piano. Solo per chi il cambio l'ha
  // applicato davvero, o le email partirebbero una per evento.
  if (esito.cambiato) {
    await notifyPlanActivated({
      organizationId,
      previousPlan: esito.pianoPrecedente,
      newPlan: planId,
    });
  }
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
 * L'organizzazione a cui appartiene un abbonamento Stripe.
 *
 * I metadati restano la prima strada perché non costano una query, ma non
 * sono garantiti: un abbonamento creato a mano in dashboard non li ha, e
 * senza questo ripiego l'evento verrebbe ignorato in silenzio su un
 * abbonamento che invece è di qualcuno.
 */
async function organizzazioneDi(subscription: Stripe.Subscription): Promise<string | null> {
  const daiMetadati = subscription.metadata?.organizationId;
  if (daiMetadati) return daiMetadati;

  const riga = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
    select: { organizationId: true },
  });

  return riga?.organizationId ?? null;
}

/**
 * Riscrive sui metadati Stripe il piano che i prezzi dicono davvero.
 *
 * Quando il cambio avviene dal Portale Clienti, Stripe aggiorna il prezzo e
 * lascia i metadati com'erano. Da qui in avanti il piano lo leggiamo dai
 * prezzi, quindi la piattaforma resta corretta comunque; ma quei metadati li
 * leggono anche la dashboard Stripe, le esportazioni e chiunque debba capire
 * un abbonamento guardandolo, e lasciarli dire "starter" su un Enterprise
 * significa spedire qualcuno nella direzione sbagliata durante un problema.
 *
 * La riscrittura genera un altro `customer.subscription.updated`: al secondo
 * giro i metadati coincidono e non si riparte. Non lancia mai.
 */
async function allineaMetadati(
  subscription: Stripe.Subscription,
  organizationId: string,
  daiPrezzi: PianoDaPrezzo
): Promise<void> {
  const attuali = subscription.metadata ?? {};
  if (
    attuali.organizationId === organizationId &&
    attuali.planId === daiPrezzi.plan &&
    attuali.interval === daiPrezzi.interval
  ) {
    return;
  }

  try {
    await getStripe().subscriptions.update(subscription.id, {
      metadata: {
        ...attuali,
        organizationId,
        planId: daiPrezzi.plan,
        interval: daiPrezzi.interval,
      },
    });

    console.info("[BILLING-METADATA-SYNC]", {
      organizationId,
      subscriptionId: subscription.id,
      da: { planId: attuali.planId ?? null, interval: attuali.interval ?? null },
      a: { planId: daiPrezzi.plan, interval: daiPrezzi.interval },
    });
  } catch (error) {
    reportWebhookError(error, "stripe", "metadata-sync");
    console.error("[api/stripe/webhook] Metadati dell'abbonamento non riallineati", {
      organizationId,
      subscriptionId: subscription.id,
    });
  }
}

/**
 * Postazioni occupate contro quelle del piano appena applicato.
 *
 * Un passaggio a un piano più piccolo non può essere rifiutato: quando
 * l'evento arriva, su Stripe è già successo. Quello che si può fare è non
 * lasciarlo invisibile. Nessun accesso viene revocato — buttare fuori un
 * agente a metà giornata per far tornare un conteggio sarebbe una reazione
 * peggiore del problema — e il limite continua a valere sugli inviti nuovi,
 * dove il controllo esisteva già.
 */
async function verificaPostazioni(organizationId: string): Promise<void> {
  try {
    const seats = await getSeatAccounting(organizationId);
    if (seats.maxSeats === null || seats.usedSeats <= seats.maxSeats) return;

    console.warn("[BILLING-SEATS-OVER]", {
      organizationId,
      piano: seats.plan.id,
      usate: seats.usedSeats,
      disponibili: seats.maxSeats,
    });

    await notifySeatsOverLimit({
      organizationId,
      planName: seats.plan.name,
      usedSeats: seats.usedSeats,
      maxSeats: seats.maxSeats,
    });
  } catch (error) {
    reportWebhookError(error, "stripe", "seats-check");
    console.error("[api/stripe/webhook] Controllo postazioni non riuscito", { organizationId });
  }
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

/**
 * Allinea piano, limiti e voci accessorie allo stato di un abbonamento Stripe.
 *
 * # Il piano lo dicono i prezzi, non i metadati
 *
 * E' cio' che rende sicuro il cambio piano dal Portale Clienti: li' Stripe
 * sostituisce il prezzo e lascia i metadati fermi, e leggere quelli
 * significava applicare i limiti del piano vecchio a chi paga gia' il nuovo.
 * I metadati restano come ripiego per un prezzo non riconoscibile, per
 * esempio dopo una revisione del listino.
 *
 * # Upgrade subito, downgrade a fine periodo
 *
 * Si leggono le **voci applicate** (`items`), mai `pending_update`: un upgrade
 * il cui pagamento e' ancora in corso non cambia le voci finche' non e'
 * incassato, quindi non sblocca niente prima del tempo. Un downgrade il
 * portale lo programma a fine periodo (vedi `lib/billing/portal-config.ts`):
 * fino ad allora il prezzo sull'abbonamento resta quello pagato, e l'agenzia
 * tiene piano, limiti e bonus per cui ha gia' pagato. Al cambio di fase
 * Stripe manda un `customer.subscription.updated` con il prezzo nuovo, e il
 * downgrade si applica qui, in quel momento.
 *
 * Limiti e bonus seguono da soli: le API e le pagine riservate leggono il
 * piano dal database (`getPlanId`), non dal token di sessione.
 */
async function sincronizzaAbbonamento(subscription: Stripe.Subscription): Promise<void> {
  const organizationId = await organizzazioneDi(subscription);
  const daiPrezzi = pianoDaAbbonamento(subscription);
  const planId = daiPrezzi?.plan ?? readPlanFromMetadata(subscription.metadata);

  // Un abbonamento non ancora pagato (`incomplete`) o sospeso per mancato
  // pagamento non deve attivare ne' mantenere un piano.
  if (organizationId && planId && subscription.status === "active") {
    await activatePlan(organizationId, planId, subscription.id, null, ancoraDi(subscription));
    await syncCancellationState(organizationId, subscription);
    await syncExtraSeats(organizationId, subscription);
    // Aggiunge la voce a consumo all'Enterprise mensile e la toglie da un
    // abbonamento diventato annuale, dove produrrebbe fatture mensili e farebbe
    // chiudere a fine mese un anno pagato.
    await syncOverageItem(organizationId, subscription, planId);

    if (daiPrezzi) await allineaMetadati(subscription, organizationId, daiPrezzi);
    await verificaPostazioni(organizationId);
  } else if (subscription.status === "canceled" || subscription.status === "unpaid") {
    await downgradeToTrial(subscription.id);
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

        if (!organizationId) {
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

        // Anche qui il piano lo dicono i prezzi dell'abbonamento appena riletto;
        // i metadati della sessione restano il ripiego se la rilettura e' fallita.
        const planId =
          (abbonamento ? pianoDaAbbonamento(abbonamento)?.plan : null) ??
          readPlanFromMetadata(session.metadata);

        if (!planId) {
          console.error("[api/stripe/webhook] Piano non riconoscibile per la sessione", {
            sessionId: session.id,
          });
          break;
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

      // Creazione e modifica passano dalla stessa strada: e' lo stato
      // dell'abbonamento che conta, non l'evento che lo annuncia. Il `created`
      // e' una rete di sicurezza per il `checkout.session.completed` (se quello
      // fallisce, questo attiva comunque il piano pagato) e il doppio arrivo
      // non applica niente due volte: vedi `activatePlan`.
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await sincronizzaAbbonamento(event.data.object);
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
