import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrCreateReferrerCoupon, getStripe, isStripeEnabled } from "@/lib/billing/stripe";

/**
 * Applica o rimuove lo sconto ricorrente dell'invitante sul suo abbonamento
 * Stripe. Riguarda solo il lato Referrer del Programma Referral: lo sconto
 * di benvenuto dell'invitata è un'altra cosa — una tantum, applicato al
 * Checkout, non a questo abbonamento (vedi `REFEREE_WELCOME_DISCOUNT_PERCENT`
 * in `lib/referrals/constants.ts` e `getOrCreateRefereeCoupon`).
 *
 * Non lancia mai: un problema nell'applicare lo sconto non deve far fallire
 * l'evento che l'ha innescato (l'attivazione del piano dell'invitata resta
 * valida comunque).
 */
async function setReferralDiscount(organizationId: string, active: boolean): Promise<void> {
  try {
    if (!isStripeEnabled()) {
      console.warn("[referrals/discount] Stripe non configurato: sconto calcolato ma non applicato", {
        organizationId,
        active,
      });
      return;
    }

    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
      select: { stripeSubscriptionId: true },
    });

    if (!subscription?.stripeSubscriptionId) return;

    const stripe = getStripe();

    if (!active) {
      await stripe.subscriptions.deleteDiscount(subscription.stripeSubscriptionId).catch(() => {
        // Nessuno sconto da rimuovere: non è un errore.
      });
      return;
    }

    const couponId = await getOrCreateReferrerCoupon(stripe);
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      discounts: [{ coupon: couponId }],
    });
  } catch (error) {
    console.error("[referrals/discount] Applicazione sconto fallita", { organizationId, active, error });
  }
}

/**
 * Ricalcola lo sconto dell'agenzia invitante: attivo se ha almeno un
 * referral ACTIVE, spento altrimenti. Binario e non a somma — più referral
 * attivi non aumentano lo sconto oltre la percentuale fissa.
 *
 * Chiamata da `lib/referrals/lifecycle.ts` quando un referral diventa ACTIVE
 * (primo pagamento dell'invitata) o torna EXPIRED (disdetta): in entrambi i
 * casi il conteggio può essere cambiato, e ricalcolarlo da zero è più
 * affidabile che tenere un contatore separato.
 */
export async function recomputeReferrerDiscount(referrerOrganizationId: string): Promise<void> {
  const activeCount = await prisma.referral.count({
    where: { referrerId: referrerOrganizationId, status: "ACTIVE" },
  });

  await setReferralDiscount(referrerOrganizationId, activeCount > 0);
}
