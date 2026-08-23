import "server-only";
import { prisma } from "@/lib/prisma";
import { recomputeReferrerDiscount } from "./discount";

/**
 * Il referral in cui questa organizzazione è l'invitata, se esiste, con i
 * dati che servono a chi deve poi ricalcolare lo sconto dell'invitante o
 * capire se lo sconto di benvenuto è già stato consumato.
 */
async function findRefereeReferral(refereeOrganizationId: string) {
  return prisma.referral.findUnique({
    where: { refereeId: refereeOrganizationId },
    select: { id: true, status: true, referrerId: true, refereeWelcomeDiscountAppliedAt: true },
  });
}

/**
 * Primo pagamento a buon fine dell'invitata — chiamata da `activatePlan` nel
 * webhook Stripe. Gestisce entrambi i lati del Win-Win, che qui condividono
 * lo stesso trigger ma restano concettualmente separati:
 *
 * - Lato invitante: il referral passa a ACTIVE e il suo sconto ricorrente
 *   viene (ri)calcolato — binario, non a somma per più referral.
 * - Lato invitata: `refereeWelcomeDiscountAppliedAt` si marca ora, se non lo
 *   era già. Non applica lo sconto in sé (quello è già avvenuto al Checkout,
 *   vedi `app/api/stripe/checkout/route.ts`): registra solo che è stato
 *   consumato, così un'eventuale disdetta e un nuovo abbonamento futuro non
 *   lo fanno scattare una seconda volta.
 *
 * Non lancia mai: un problema qui non deve far fallire l'attivazione del
 * piano che l'ha innescato.
 */
export async function activateRefereeReferral(refereeOrganizationId: string): Promise<void> {
  try {
    const referral = await findRefereeReferral(refereeOrganizationId);
    if (!referral) return;

    const needsActivation = referral.status !== "ACTIVE";
    const needsWelcomeFlag = !referral.refereeWelcomeDiscountAppliedAt;
    if (!needsActivation && !needsWelcomeFlag) return;

    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        ...(needsActivation && { status: "ACTIVE", activatedAt: new Date(), expiredAt: null }),
        ...(needsWelcomeFlag && { refereeWelcomeDiscountAppliedAt: new Date() }),
      },
    });

    if (needsActivation) {
      await recomputeReferrerDiscount(referral.referrerId);
    }
  } catch (error) {
    console.error("[referrals/lifecycle] Attivazione referral fallita", {
      refereeOrganizationId,
      error,
    });
  }
}

/**
 * Il referral dell'invitata torna EXPIRED quando il suo abbonamento non è più
 * a pagamento — chiamata da `downgradeToTrial` nel webhook Stripe.
 *
 * Riguarda solo lo sconto dell'invitante, che si ricalcola di conseguenza:
 * `refereeWelcomeDiscountAppliedAt` non si tocca, perché lo sconto di
 * benvenuto è già stato consumato una volta e non deve poter scattare di
 * nuovo a un successivo riabbonamento.
 */
export async function expireRefereeReferral(refereeOrganizationId: string): Promise<void> {
  try {
    const referral = await findRefereeReferral(refereeOrganizationId);
    if (!referral || referral.status !== "ACTIVE") return;

    await prisma.referral.update({
      where: { id: referral.id },
      data: { status: "EXPIRED", expiredAt: new Date() },
    });

    await recomputeReferrerDiscount(referral.referrerId);
  } catch (error) {
    console.error("[referrals/lifecycle] Scadenza referral fallita", {
      refereeOrganizationId,
      error,
    });
  }
}
