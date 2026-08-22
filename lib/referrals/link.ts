import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Collega una nuova agenzia al referral che l'ha portata qui, se il codice
 * fornito è valido.
 *
 * Non lancia mai: un codice sbagliato, scaduto o un'organizzazione appena
 * cancellata fra la lettura e la scrittura non devono far fallire una
 * registrazione già avvenuta — il referral è un accessorio della crescita,
 * non un requisito dell'account (stesso principio di `deliverLeadToCrm`).
 */
export async function linkReferral(
  refereeOrganizationId: string,
  rawReferralCode: string | null | undefined
): Promise<void> {
  const code = rawReferralCode?.trim().toUpperCase();
  if (!code) return;

  try {
    const referrer = await prisma.organization.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });

    // Codice inesistente, o l'agenzia sta provando a invitare se stessa:
    // in entrambi i casi non si crea nulla, silenziosamente.
    if (!referrer || referrer.id === refereeOrganizationId) return;

    await prisma.referral.create({
      data: { referrerId: referrer.id, refereeId: refereeOrganizationId, status: "PENDING" },
    });
  } catch (error) {
    console.error("[referrals] Collegamento referral non riuscito", {
      refereeOrganizationId,
      error,
    });
  }
}
