import "server-only";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateReferralCoupon,
  getStripe,
  isStripeEnabled,
  MAX_REFERRAL_DISCOUNT_PERCENT,
  REFERRAL_DISCOUNT_PERCENT_PER_REFERRAL,
} from "@/lib/billing/stripe";

/**
 * Ricalcola e riapplica lo sconto Programma Referral dell'agenzia invitante,
 * sommando tutti i suoi referral ACTIVE (fino al tetto massimo) e
 * aggiornando il coupon sul suo abbonamento Stripe di conseguenza.
 *
 * Chiamata sia quando un referral diventa ACTIVE (il primo pagamento
 * dell'invitata) sia quando torna EXPIRED (l'invitata ha disdetto): in
 * entrambi i casi il totale può essere cambiato, e ricalcolarlo da zero è più
 * affidabile che sommare o sottrarre incrementalmente.
 *
 * Non lancia mai: un problema nell'applicare lo sconto non deve far fallire
 * l'evento webhook che l'ha innescato (l'attivazione del piano dell'invitata
 * resta valida comunque).
 */
export async function recomputeReferrerDiscount(referrerOrganizationId: string): Promise<void> {
  try {
    const activeCount = await prisma.referral.count({
      where: { referrerId: referrerOrganizationId, status: "ACTIVE" },
    });

    const percent = Math.min(
      activeCount * REFERRAL_DISCOUNT_PERCENT_PER_REFERRAL,
      MAX_REFERRAL_DISCOUNT_PERCENT
    );

    if (!isStripeEnabled()) {
      console.warn("[referrals/discount] Stripe non configurato: sconto calcolato ma non applicato", {
        referrerOrganizationId,
        percent,
      });
      return;
    }

    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: referrerOrganizationId },
      select: { stripeSubscriptionId: true },
    });

    if (!subscription?.stripeSubscriptionId) return;

    const stripe = getStripe();

    if (percent === 0) {
      await stripe.subscriptions.deleteDiscount(subscription.stripeSubscriptionId).catch(() => {
        // Nessuno sconto da rimuovere: non è un errore.
      });
      return;
    }

    const couponId = await getOrCreateReferralCoupon(stripe, percent);
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      discounts: [{ coupon: couponId }],
    });
  } catch (error) {
    console.error("[referrals/discount] Ricalcolo sconto fallito", {
      referrerOrganizationId,
      error,
    });
  }
}
