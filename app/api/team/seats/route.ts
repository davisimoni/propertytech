import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getExtraSeatPriceId, getStripe, isStripeEnabled } from "@/lib/billing/stripe";
import { getSeatAccounting } from "@/lib/billing/seats";
import { EXTRA_SEAT_PRICE_EUR } from "@/lib/plans";

/**
 * Postazioni aggiuntive: acquisto e rinuncia.
 *
 * # Chi paga decide
 *
 * Solo il titolare. Aggiungere una postazione aumenta la fattura mensile, e un
 * collaboratore non deve poter impegnare l'agenzia — è la stessa regola che
 * governa già checkout, disdetta e sconto di retention.
 *
 * # Perché la quantità e non righe separate
 *
 * Sull'abbonamento Stripe le postazioni extra sono UNA voce con una quantità.
 * Cambiarla è un `subscriptions.update`, e il conteggio proporzionale sul
 * periodo già pagato lo fa Stripe da solo: chi compra una postazione a metà
 * mese paga la metà, e chi la toglie se la vede scalare. Rifare quel calcolo
 * da noi significherebbe sbagliarlo.
 *
 * # L'ordine delle scritture
 *
 * Prima Stripe, poi il database. Se l'aggiornamento su Stripe fallisce non si
 * scrive nulla e l'agenzia resta dov'era; se fallisse la scrittura locale il
 * webhook `customer.subscription.updated` riallinea comunque, perché legge la
 * quantità dalla stessa voce. Mai il contrario — un `extraSeats` locale più
 * alto di quello che l'agenzia paga significa regalare postazioni.
 */

const seatsSchema = z.object({
  /** Postazioni aggiuntive totali desiderate, non la variazione. */
  extraSeats: z.number().int().min(0).max(50),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "forbidden", message: "Solo il titolare può gestire le postazioni." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = seatsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", message: parsed.error.issues[0]?.message ?? "Dati non validi." },
      { status: 400 }
    );
  }

  const organizationId = session.user.organizationId;
  const richieste = parsed.data.extraSeats;
  const seats = await getSeatAccounting(organizationId);

  if (!seats.canBuyMore) {
    return NextResponse.json(
      {
        error: "plan_without_extra_seats",
        message: `Le postazioni aggiuntive si acquistano sul piano Professional. Sul piano ${seats.plan.name} le postazioni si concordano con noi.`,
      },
      { status: 400 }
    );
  }

  /*
   * Non si scende sotto le postazioni occupate.
   *
   * Togliere una postazione a cui è già seduto qualcuno lascerebbe l'agenzia
   * con più collaboratori del consentito e nessun modo ovvio di rientrare: il
   * sistema dovrebbe scegliere chi disattivare, e non è una decisione che può
   * prendere un pulsante. Prima si rimuove la persona, poi la postazione.
   */
  const minimeNecessarie = Math.max(0, seats.usedSeats - (seats.planSeats ?? 0));
  if (richieste < minimeNecessarie) {
    return NextResponse.json(
      {
        error: "seats_in_use",
        message: `Non puoi scendere sotto ${minimeNecessarie} postazioni aggiuntive: ne hai ${seats.usedSeats} occupate. Rimuovi prima un collaboratore dal team.`,
      },
      { status: 409 }
    );
  }

  if (richieste === seats.extraSeats) {
    return NextResponse.json({ extraSeats: richieste, maxSeats: seats.maxSeats });
  }

  if (!isStripeEnabled()) {
    return NextResponse.json(
      { error: "billing_unavailable", message: "La fatturazione non è configurata." },
      { status: 503 }
    );
  }

  const priceId = getExtraSeatPriceId();
  if (!priceId) {
    return NextResponse.json(
      {
        error: "price_not_configured",
        message: "Il prezzo delle postazioni aggiuntive non è configurato. Scrivici e lo attiviamo.",
      },
      { status: 503 }
    );
  }

  const abbonamento = await prisma.subscription.findUnique({
    where: { organizationId },
    select: { stripeSubscriptionId: true },
  });

  if (!abbonamento?.stripeSubscriptionId) {
    return NextResponse.json(
      {
        error: "no_subscription",
        message: "Attiva prima un abbonamento: le postazioni aggiuntive si aggiungono a un piano attivo.",
      },
      { status: 409 }
    );
  }

  try {
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(abbonamento.stripeSubscriptionId);

    const voceEsistente = subscription.items.data.find((item) => item.price.id === priceId);

    if (richieste === 0 && voceEsistente) {
      // Zero postazioni: la voce si toglie invece di restare a quantità zero,
      // che in fattura comparirebbe come una riga da zero euro senza dire
      // niente a nessuno.
      await stripe.subscriptionItems.del(voceEsistente.id, { proration_behavior: "create_prorations" });
    } else if (voceEsistente) {
      await stripe.subscriptionItems.update(voceEsistente.id, {
        quantity: richieste,
        proration_behavior: "create_prorations",
      });
    } else {
      await stripe.subscriptionItems.create({
        subscription: abbonamento.stripeSubscriptionId,
        price: priceId,
        quantity: richieste,
        proration_behavior: "create_prorations",
      });
    }

    await prisma.organization.update({
      where: { id: organizationId },
      data: { extraSeats: richieste },
    });

    console.info("[BILLING-SEATS]", {
      organizationId,
      da: seats.extraSeats,
      a: richieste,
      costoMensileEur: richieste * EXTRA_SEAT_PRICE_EUR,
    });

    const aggiornate = await getSeatAccounting(organizationId);
    return NextResponse.json({
      extraSeats: aggiornate.extraSeats,
      maxSeats: aggiornate.maxSeats,
      usedSeats: aggiornate.usedSeats,
    });
  } catch (error) {
    console.error("[api/team/seats] Aggiornamento postazioni non riuscito", {
      organizationId,
      error,
    });
    return NextResponse.json(
      {
        error: "stripe_error",
        message: "Non è stato possibile aggiornare le postazioni. Riprova fra poco.",
      },
      { status: 502 }
    );
  }
}
