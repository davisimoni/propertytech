import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrCreateReferralCoupon, getStripe, isStripeEnabled } from "@/lib/billing/stripe";

/**
 * Applica o rimuove lo sconto fisso del Programma Referral sull'abbonamento
 * Stripe di un'organizzazione. Chiamata solo per l'invitante: l'agenzia
 * invitata non ha mai diritto a questo sconto, vedi `REFERRAL_DISCOUNT_PERCENT`
 * in `lib/referrals/constants.ts`.
 *
 * Non lancia mai: un problema nell'applicare lo sconto non deve far fallire
 * l'evento che l'ha innescato (la registrazione dell'invitata resta valida
 * comunque).
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

    const couponId = await getOrCreateReferralCoupon(stripe);
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
 * Chiamata da `linkReferral` non appena un'agenzia si registra con il codice
 * di questo invitante: con l'attivazione asimmetrica ogni referral creato è
 * già ACTIVE, quindi in pratica il conteggio non può che crescere — resta
 * comunque un ricalcolo (e non un semplice incremento) perché più affidabile
 * e a prova di doppie chiamate.
 */
export async function recomputeReferrerDiscount(referrerOrganizationId: string): Promise<void> {
  const activeCount = await prisma.referral.count({
    where: { referrerId: referrerOrganizationId, status: "ACTIVE" },
  });

  await setReferralDiscount(referrerOrganizationId, activeCount > 0);
}
