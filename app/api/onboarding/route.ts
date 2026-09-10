import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { PlanId } from "@/lib/plans";

/**
 * Stato dei passaggi di avvio, dedotto da ciò che l'agenzia ha realmente
 * fatto: nessun flag "onboarding completato" da mantenere sincronizzato, così
 * la checklist non può divergere dallo stato effettivo dell'account.
 *
 * # I quattro passaggi ricalcano i quattro moduli, non più il funnel lead→match
 *
 * La versione precedente seguiva il percorso di un lead (WhatsApp → agenda →
 * portafoglio → match): buona per dimostrare il valore del Modulo 1, cieca su
 * tutto il resto. Questa segue invece "hai toccato con mano ciascuno dei
 * quattro moduli AI?", perché è quello che decide se un trial diventa un
 * abbonamento — un'agenzia che ha visto solo WhatsApp funzionare non sa che
 * esiste anche il resto.
 *
 * # Perché il quarto passaggio non conta per tutti
 *
 * Le Note Vocali sono incluse solo in Enterprise (`voiceReportsLimit: 0` su
 * Trial, Starter e Pro — deciso apposta: è la funzione più facile da usare in
 * volume su un account che non ha dato una carta). Contarla come step
 * obbligatorio manderebbe la maggioranza degli agenti dritti nel paywall non
 * chiudibile all'ultimo passo di un flusso che esiste per togliere attrito —
 * l'esperienza peggiore possibile. Per chi non è su Enterprise il totale è
 * quindi 3, e il completamento arriva a 3/3: il quarto resta visibile come
 * anteprima di cosa sblocca il piano superiore, ma non impedisce mai la
 * festa a chi non può raggiungerlo.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;

  const [organization, usage, slotCount, appraisalCount, socialCount] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        onboardingBonusGrantedAt: true,
        subscription: { select: { status: true } },
        whatsAppConfig: { select: { isConnected: true } },
      },
    }),
    prisma.usageTracker.findUnique({
      where: { organizationId },
      select: { docCreditsUsed: true, voiceCreditsUsed: true },
    }),
    prisma.calendarSlot.count({ where: { organizationId } }),
    prisma.auctionAppraisal.count({ where: { organizationId } }),
    prisma.aiGeneration.count({
      where: { organizationId, kind: { in: ["SOCIAL", "LISTING"] } },
    }),
  ]);

  const planId = (organization?.subscription?.status ?? "trial") as PlanId;
  const isEnterprise = planId === "enterprise";

  const steps = {
    // Prerequisito operativo: basta uno dei due, non entrambi. Il primo
    // messaggio che arriva serve comunque a poco se non c'è uno slot su cui
    // fissare la visita — ma chiedere due azioni per un solo "sei pronto a
    // partire?" allunga il primo passo senza aggiungere valore percepito.
    prerequisiteReady: (organization?.whatsAppConfig?.isConnected ?? false) || slotCount > 0,
    // Stessa alternativa di prima, riformulata sui due moduli che leggono un
    // PDF: la prima perizia d'asta o la prima visura/atto. Sono la stessa
    // azione — trascinare un documento — su due pagine diverse.
    firstDocumentOrAppraisal: (usage?.docCreditsUsed ?? 0) > 0 || appraisalCount > 0,
    firstSocialGenerated: socialCount > 0,
    firstVoiceReport: (usage?.voiceCreditsUsed ?? 0) > 0,
  };

  // Il quarto passaggio esce dal conteggio fuori da Enterprise: resta nello
  // stato per la riga del widget, ma non nella frazione di completamento.
  const stepsForCompletion = isEnterprise
    ? steps
    : { prerequisiteReady: steps.prerequisiteReady, firstDocumentOrAppraisal: steps.firstDocumentOrAppraisal, firstSocialGenerated: steps.firstSocialGenerated };

  const completed = Object.values(stepsForCompletion).filter(Boolean).length;
  const total = Object.keys(stepsForCompletion).length;
  const isComplete = completed === total;

  /*
   * Il bonus si assegna qui, lazy, la prima volta che una lettura scopre il
   * completamento — non in una rotta a parte che qualcuno dovrebbe ricordarsi
   * di chiamare.
   *
   * `updateMany` con `onboardingBonusGrantedAt: null` nel `where` è la
   * guardia di atomicità: se due richieste arrivano insieme, solo una trova
   * la riga ancora `null` e la aggiorna, la seconda tocca zero righe. Stessa
   * forma di `retentionDiscountAppliedAt` per lo sconto di retention — un
   * vantaggio concesso una volta sola non può dipendere da "spero che nessuno
   * lo richieda due volte in parallelo".
   */
  let bonusJustGranted = false;
  if (isComplete && organization && !organization.onboardingBonusGrantedAt) {
    const esito = await prisma.organization.updateMany({
      where: { id: organizationId, onboardingBonusGrantedAt: null },
      data: { onboardingBonusGrantedAt: new Date(), bonusWhatsappCredits: { increment: 5 } },
    });
    bonusJustGranted = esito.count > 0;

    if (bonusJustGranted) {
      console.info("[ONBOARDING-BONUS-GRANTED]", { organizationId });
    }
  }

  return NextResponse.json({
    steps,
    isEnterprise,
    completed,
    total,
    isComplete,
    bonusJustGranted,
  });
}
