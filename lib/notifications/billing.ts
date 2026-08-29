import "server-only";
import { PLANS, type PlanId } from "@/lib/plans";
import { resolveOwner } from "@/lib/email/recipients";
import {
  sendPlanChangedEmail,
  sendSubscriptionActivatedEmail,
  sendSubscriptionCancelledEmail,
  sendPaymentFailedEmail,
} from "@/lib/email/transactional";

/**
 * Avvisi legati all'abbonamento.
 *
 * Vivono qui e non dentro la rotta del webhook Stripe per una ragione precisa:
 * quella rotta risponde **500 quando qualcosa fallisce**, perché è così che
 * chiede a Stripe di ritentare. Un errore di invio email dentro quel blocco
 * farebbe ritentare l'intero evento — riattivando piani, azzerando crediti e
 * rispedendo email già partite. Qui nulla lancia mai.
 */

/** Ordine dei piani, per distinguere un passaggio in su da uno in giù. */
const ORDINE: PlanId[] = ["trial", "starter", "pro", "enterprise"];

function isUpgrade(precedente: PlanId, nuovo: PlanId): boolean {
  return ORDINE.indexOf(nuovo) > ORDINE.indexOf(precedente);
}

function prezzoLeggibile(planId: PlanId): string {
  const plan = PLANS[planId];
  // `null` sui piani senza prezzo di listino (trial, e un eventuale
  // contratto negoziato): non si scrive "0 €", che sembrerebbe un errore.
  return plan.priceEurMonthly ? `${plan.priceEurMonthly} €/mese` : "Gratuito";
}

/**
 * Piano attivato o cambiato.
 *
 * Distingue il primo acquisto (si arriva dal trial) da un passaggio fra piani
 * a pagamento: sono due messaggi diversi, e mandare "benvenuto nel piano" a
 * chi è appena sceso di livello suonerebbe come una presa in giro.
 */
export async function notifyPlanActivated(params: {
  organizationId: string;
  previousPlan: PlanId;
  newPlan: PlanId;
  renewsOn?: Date | null;
}): Promise<void> {
  try {
    if (params.previousPlan === params.newPlan) return;

    const owner = await resolveOwner(params.organizationId);
    if (!owner) return;

    const nome = PLANS[params.newPlan].name;

    const outcome =
      params.previousPlan === "trial"
        ? await sendSubscriptionActivatedEmail({
            to: owner.email,
            firstName: owner.firstName,
            planName: nome,
            amountLabel: prezzoLeggibile(params.newPlan),
            renewsOn: params.renewsOn,
          })
        : await sendPlanChangedEmail({
            to: owner.email,
            firstName: owner.firstName,
            previousPlan: PLANS[params.previousPlan].name,
            newPlan: nome,
            isUpgrade: isUpgrade(params.previousPlan, params.newPlan),
          });

    console.info("[BILLING-NOTIFY] piano", {
      organizationId: params.organizationId,
      da: params.previousPlan,
      a: params.newPlan,
      outcome,
    });
  } catch (error) {
    console.error("[notifications/billing] Avviso di cambio piano non inviato", {
      organizationId: params.organizationId,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}

/** Disdetta registrata, o abbonamento terminato. */
export async function notifySubscriptionCancelled(params: {
  organizationId: string;
  planName: string;
  activeUntil?: Date | null;
}): Promise<void> {
  try {
    const owner = await resolveOwner(params.organizationId);
    if (!owner) return;

    const outcome = await sendSubscriptionCancelledEmail({
      to: owner.email,
      firstName: owner.firstName,
      planName: params.planName,
      activeUntil: params.activeUntil,
    });

    console.info("[BILLING-NOTIFY] disdetta", {
      organizationId: params.organizationId,
      outcome,
    });
  } catch (error) {
    console.error("[notifications/billing] Avviso di disdetta non inviato", {
      organizationId: params.organizationId,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}

/** Rinnovo rifiutato: è l'email che evita di scoprire il blocco dai lead che non rispondono. */
export async function notifyPaymentFailed(params: {
  organizationId: string;
  planId: PlanId;
  amountLabel: string;
  updateUrl?: string | null;
}): Promise<void> {
  try {
    const owner = await resolveOwner(params.organizationId);
    if (!owner) return;

    const outcome = await sendPaymentFailedEmail({
      to: owner.email,
      firstName: owner.firstName,
      planName: PLANS[params.planId].name,
      amountLabel: params.amountLabel,
      updateUrl: params.updateUrl,
    });

    console.info("[BILLING-NOTIFY] pagamento fallito", {
      organizationId: params.organizationId,
      outcome,
    });
  } catch (error) {
    console.error("[notifications/billing] Avviso di pagamento fallito non inviato", {
      organizationId: params.organizationId,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}
