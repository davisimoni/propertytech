import "server-only";
import { prisma } from "@/lib/prisma";
import { recomputeReferrerDiscount, setRefereeDiscount } from "./discount";

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
 *
 * Win-Win: attiva lo sconto sia sull'abbonamento dell'invitata (il suo,
 * diretto) sia su quello dell'invitante (ricalcolato, perché dipende da
 * quanti referral ha attivi in totale).
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

    await setRefereeDiscount(refereeOrganizationId, true);
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
 *
 * Spegne lo sconto su entrambi i lati, simmetricamente ad `activateRefereeReferral`.
 */
export async function expireRefereeReferral(refereeOrganizationId: string): Promise<void> {
  try {
    const referral = await findRefereeReferral(refereeOrganizationId);
    if (!referral || referral.status !== "ACTIVE") return;

    await prisma.referral.update({
      where: { id: referral.id },
      data: { status: "EXPIRED", expiredAt: new Date() },
    });

    await setRefereeDiscount(refereeOrganizationId, false);
    await recomputeReferrerDiscount(referral.referrerId);
  } catch (error) {
    console.error("[referrals/lifecycle] Scadenza referral fallita", {
      refereeOrganizationId,
      error,
    });
  }
}
