import "server-only";
import { prisma } from "@/lib/prisma";
import { recomputeReferrerDiscount } from "./discount";

/**
 * Collega una nuova agenzia al referral che l'ha portata qui, se il codice
 * fornito è valido, e attiva subito lo sconto dell'invitante.
 *
 * Sconto asimmetrico: il trigger è la registrazione dell'invitata, non il suo
 * primo pagamento — vale anche per un account sul piano gratuito, "anche
 * gratuito" per l'esattezza. Per questo il referral nasce già ACTIVE, non
 * PENDING: a differenza della versione precedente non c'è più un webhook
 * Stripe ad attivarlo in un secondo momento. L'invitata stessa non riceve
 * alcuno sconto, né ora né dopo un eventuale abbonamento — si registra e paga
 * a prezzo di listino pieno.
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
      data: {
        referrerId: referrer.id,
        refereeId: refereeOrganizationId,
        status: "ACTIVE",
        activatedAt: new Date(),
      },
    });

    await recomputeReferrerDiscount(referrer.id);
  } catch (error) {
    console.error("[referrals] Collegamento referral non riuscito", {
      refereeOrganizationId,
      error,
    });
  }
}
