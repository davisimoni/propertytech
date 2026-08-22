import "server-only";
import { prisma } from "@/lib/prisma";
import { recomputeReferrerDiscount } from "./discount";

/**
 * Il referral in cui questa organizzazione è l'invitata, se esiste, con
 * l'id dell'invitante — serve a chi deve poi ricalcolare lo sconto.
 */
async function findRefereeReferral(refereeOrganizationId: string) {
  return prisma.referral.findUnique({
    where: { refereeId: refereeOrganizationId },
    select: { id: true, status: true, referrerId: true },
  });
}

/**
 * Il referral dell'invitata passa ad ACTIVE quando il suo abbonamento
 * diventa a pagamento — chiamata da `activatePlan` nel webhook Stripe.
 *
 * Non lancia mai: è un accessorio dell'attivazione del piano, non deve farla
 * fallire (stesso principio di `deliverLeadToCrm`).
 */
export async function activateRefereeReferral(refereeOrganizationId: string): Promise<void> {
  try {
    const referral = await findRefereeReferral(refereeOrganizationId);
    // Niente referral, o già ACTIVE (evento webhook duplicato, idempotenza):
    // nulla da fare.
    if (!referral || referral.status === "ACTIVE") return;

    await prisma.referral.update({
      where: { id: referral.id },
      data: { status: "ACTIVE", activatedAt: new Date(), expiredAt: null },
    });

    await recomputeReferrerDiscount(referral.referrerId);
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
