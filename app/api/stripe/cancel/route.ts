import { NextResponse } from "next/server";
import { z } from "zod";
import type { CancellationReason } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  CANCELLATION_REASON_TO_STRIPE_FEEDBACK,
  getStripe,
  isCancellationReason,
  isStripeEnabled,
} from "@/lib/billing/stripe";

const cancelSchema = z.object({
  reason: z.custom<CancellationReason>(
    (v) => typeof v === "string" && isCancellationReason(v),
    "Motivo non valido"
  ),
  details: z.string().trim().max(2000).optional(),
});

/**
 * Conferma della disdetta (Modulo 2 del flusso di cancellazione): salva il
 * questionario e imposta `cancel_at_period_end` su Stripe.
 *
 * Il feedback viene sempre registrato, anche se la chiamata a Stripe fallisce
 * o Stripe non è configurato: è il dato che l'agenzia ha già dato, perderlo
 * per un problema a valle sarebbe peggio di un'incongruenza temporanea con lo
 * stato dell'abbonamento.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "forbidden", message: "Solo il titolare può gestire l'abbonamento." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = cancelSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { reason, details } = parsed.data;
  const organizationId = session.user.organizationId;

  const subscription = await prisma.subscription.findUnique({ where: { organizationId } });

  if (!subscription || subscription.status === "trial") {
    return NextResponse.json(
      { error: "no_active_subscription", message: "Non hai un abbonamento a pagamento da disdire." },
      { status: 400 }
    );
  }

  await prisma.cancellationFeedback.create({
    data: {
      organizationId,
      reason,
      details: details || null,
      planAtCancellation: subscription.status,
    },
  });

  if (!isStripeEnabled() || !subscription.stripeSubscriptionId) {
    // Fallback di sviluppo: nessun abbonamento reale da disdire su Stripe,
    // ma lo stato lato nostro database riflette comunque l'intenzione — utile
    // per costruire e provare la UI prima che le chiavi Stripe siano pronte.
    console.warn(
      "[api/stripe/cancel] Stripe non configurato: disdetta simulata solo lato database",
      { organizationId }
    );

    await prisma.subscription.update({
      where: { organizationId },
      data: { cancelAtPeriodEnd: true },
    });

    return NextResponse.json({ ok: true, mocked: true, cancelAtPeriodEnd: true, currentPeriodEnd: null });
  }

  try {
    const stripe = getStripe();
    const updated = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
      cancellation_details: {
        feedback: CANCELLATION_REASON_TO_STRIPE_FEEDBACK[reason],
        comment: details || undefined,
      },
    });

    // `current_period_end` vive sull'item, non più sull'abbonamento: dalla
    // versione API usata da questo SDK, una subscription può avere item con
    // cicli di fatturazione diversi.
    const periodEndSeconds = updated.items.data[0]?.current_period_end;
    const currentPeriodEnd = periodEndSeconds ? new Date(periodEndSeconds * 1000) : null;

    await prisma.subscription.update({
      where: { organizationId },
      data: { cancelAtPeriodEnd: true, currentPeriodEnd },
    });

    return NextResponse.json({
      ok: true,
      mocked: false,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: currentPeriodEnd?.toISOString() ?? null,
    });
  } catch (error) {
    // Il feedback è già salvato: l'agenzia non deve ripetere il questionario
    // solo perché la chiamata a Stripe è fallita.
    console.error("[api/stripe/cancel] Disdetta su Stripe fallita", error);
    return NextResponse.json(
      {
        error: "cancellation_failed",
        message:
          "Il tuo feedback è stato registrato, ma non siamo riusciti a completare la disdetta. Riprova o contatta l'assistenza.",
      },
      { status: 502 }
    );
  }
}
