import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrCreateReferralCoupon, getStripe, isStripeEnabled } from "@/lib/billing/stripe";

/**
 * Applica o rimuove lo sconto fisso del Programma Referral sull'abbonamento
 * Stripe di un'organizzazione — usata sia per l'invitante sia per l'invitata,
 * che ricevono esattamente lo stesso trattamento (Win-Win, niente somma).
 *
 * Non lancia mai: un problema nell'applicare lo sconto non deve far fallire
 * l'evento webhook che l'ha innescato (l'attivazione del piano dell'invitata
 * resta valida comunque).
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
 * referral ACTIVE, spento altrimenti. Binario e non più a somma — più
 * referral attivi non aumentano lo sconto oltre la percentuale fissa.
 *
 * Chiamata sia quando un referral diventa ACTIVE sia quando torna EXPIRED:
 * in entrambi i casi il conteggio può essere cambiato, e ricalcolarlo da zero
 * è più affidabile che tenere un contatore separato.
 */
export async function recomputeReferrerDiscount(referrerOrganizationId: string): Promise<void> {
  const activeCount = await prisma.referral.count({
    where: { referrerId: referrerOrganizationId, status: "ACTIVE" },
  });

  await setReferralDiscount(referrerOrganizationId, activeCount > 0);
}

/**
 * Applica o rimuove lo sconto dell'agenzia invitata, seguendo lo stato del
 * proprio referral. A differenza dell'invitante non serve un conteggio: ogni
 * organizzazione può essere invitata una sola volta (`refereeId` è unico),
 * quindi lo stato è direttamente attivo/spento.
 */
export async function setRefereeDiscount(refereeOrganizationId: string, active: boolean): Promise<void> {
  await setReferralDiscount(refereeOrganizationId, active);
}
