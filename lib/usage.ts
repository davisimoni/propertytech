import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ENTERPRISE_OVERAGE_PRICE_EUR, hasMeteredOverage, PLANS, type PlanId } from "@/lib/plans";
import { isDevPaywallBypassEnabled } from "@/lib/env";
import { isOverageBillingActive, registraConsumoExtra } from "@/lib/billing/overage";
import { assicuraPeriodoCorrente } from "@/lib/billing/usage-period";
import type {
  UsageFeature,
  UsageMetric,
  UsageStatsResponse,
  WhatsAppOverage,
} from "@/lib/usage-types";

const FEATURE_RESOURCE: Record<UsageFeature, string> = {
  whatsapp: "wa_conversations",
  documents: "doc_extractions",
  voice: "voice_reports",
  radar: "radar_appraisals",
};

const FEATURE_USAGE_FIELD = {
  whatsapp: "whatsappCreditsUsed",
  documents: "docCreditsUsed",
  voice: "voiceCreditsUsed",
  radar: "radarCreditsUsed",
} as const;

const FEATURE_LIMIT_FIELD = {
  whatsapp: "waConversationsLimit",
  documents: "ocrDocumentsLimit",
  voice: "voiceReportsLimit",
  radar: "radarAppraisalsLimit",
} as const;

function computeMetric(used: number, limit: number | null): UsageMetric {
  // Un limite pari a 0 vuol dire "funzione non compresa nel piano", non
  // "crediti finiti": senza questa distinzione `0 >= 0` risulta vero e un
  // account Trial appena creato vede subito l'avviso rosso per le note
  // vocali, che nel suo piano non esistono nemmeno.
  const isIncluded = limit !== 0;

  return {
    used,
    limit,
    remaining: limit === null ? null : Math.max(limit - used, 0),
    isLimitReached: isIncluded && limit !== null && used >= limit,
    isIncluded,
  };
}

export async function getUsageStats(organizationId: string): Promise<UsageStatsResponse> {
  // Prima di leggere, il mese di consumo: se è scaduto i contatori ripartono
  // qui, al primo accesso, senza aspettare un evento Stripe. Il gate
  // (`checkUsageLimit`) passa da questa funzione e quindi vede già il mese nuovo.
  await assicuraPeriodoCorrente(organizationId);

  // `findUnique` e non `findUniqueOrThrow`: una sessione JWT sopravvive alla
  // cancellazione della propria organizzazione — account rimosso, database
  // ripristinato da un backup più vecchio — e in quel caso ogni pagina
  // dell'area riservata restituirebbe un errore server invece di mostrarsi
  // vuota. Meglio degradare su un piano Trial a zero consumi: l'utente vede
  // un'interfaccia coerente e i gate a crediti restano comunque chiusi.
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { subscription: true, usageTracker: true },
  });

  if (!organization) {
    console.warn("[usage] Organizzazione non trovata per la sessione corrente", {
      organizationId,
    });
  }

  const planId = (organization?.subscription?.status ?? "trial") as PlanId;
  const plan = PLANS[planId];
  const usage = organization?.usageTracker;

  /*
   * Il bonus di onboarding si somma al limite del piano, mai al contrario.
   *
   * Stessa forma di `maxSeatsFor` per le postazioni: un piano a conteggio
   * illimitato (`null`) resta illimitato qualunque cosa dica il bonus — non
   * ha senso sommare un numero a "nessun tetto".
   */
  const waLimit =
    plan.waConversationsLimit === null
      ? null
      : plan.waConversationsLimit + (organization?.bonusWhatsappCredits ?? 0);
  const waMetric = computeMetric(usage?.whatsappCreditsUsed ?? 0, waLimit);
  const documents = computeMetric(usage?.docCreditsUsed ?? 0, plan[FEATURE_LIMIT_FIELD.documents]);
  const voice = computeMetric(usage?.voiceCreditsUsed ?? 0, plan[FEATURE_LIMIT_FIELD.voice]);
  const radar = computeMetric(usage?.radarCreditsUsed ?? 0, plan[FEATURE_LIMIT_FIELD.radar]);

  /*
   * Enterprise con consumo attivo: oltre l'incluso non c'è un limite da
   * raggiungere, c'è una tariffa. `isLimitReached` a false è ciò che lascia
   * passare il gate qui sotto — e l'unico posto in cui si decide, così gate,
   * pannello e badge "Limiti raggiunti" non possono dire cose diverse.
   */
  const overageActive = isOverageBillingActive(organization?.subscription);
  const whatsapp: UsageMetric = overageActive ? { ...waMetric, isLimitReached: false } : waMetric;

  let whatsappOverage: WhatsAppOverage | null = null;
  if (hasMeteredOverage(planId)) {
    const extraConversations =
      overageActive && waLimit !== null ? Math.max(0, waMetric.used - waLimit) : 0;
    whatsappOverage = {
      active: overageActive,
      extraConversations,
      unitPriceEur: ENTERPRISE_OVERAGE_PRICE_EUR,
      estimatedEur: Math.round(extraConversations * ENTERPRISE_OVERAGE_PRICE_EUR * 100) / 100,
    };
  }

  return {
    planId,
    planName: plan.name,
    whatsapp,
    documents,
    voice,
    radar,
    whatsappOverage,
    hasAnyLimitReached:
      whatsapp.isLimitReached ||
      documents.isLimitReached ||
      voice.isLimitReached ||
      radar.isLimitReached,
  };
}

/**
 * Route guard: verifies the organization still has credits for `featureType`
 * before an API route performs the corresponding action. Returns a ready
 * 402 NextResponse when the limit is exceeded (fail-closed), or `null` when
 * the caller may proceed.
 */
export async function checkUsageLimit(
  organizationId: string,
  featureType: UsageFeature
): Promise<NextResponse | null> {
  if (isDevPaywallBypassEnabled()) {
    console.warn("[usage] DEV_BYPASS_PAYWALL attivo: limite ignorato", { organizationId, featureType });
    return null;
  }

  const stats = await getUsageStats(organizationId);
  const metric = stats[featureType];

  // Il gate resta chiuso in entrambi i casi — crediti esauriti o funzione non
  // compresa nel piano — ma per ragioni diverse: la separazione serve alla UI,
  // non a chi passa di qui. Fail-closed come prima (CLAUDE.md §4).
  if (!metric.isIncluded || metric.isLimitReached) {
    return NextResponse.json(
      { error: "usage_limit_exceeded", resource: FEATURE_RESOURCE[featureType] },
      { status: 402 }
    );
  }

  return null;
}

export async function incrementUsage(organizationId: string, featureType: UsageFeature, amount = 1): Promise<void> {
  const field = FEATURE_USAGE_FIELD[featureType];

  // Un consumo del mese nuovo non deve sommarsi ai contatori del mese vecchio.
  await assicuraPeriodoCorrente(organizationId);

  const tracker = await prisma.usageTracker.update({
    where: { organizationId },
    data: { [field]: { increment: amount } },
    select: { whatsappCreditsUsed: true },
  });

  // Conversazioni oltre l'incluso Enterprise: il valore restituito dall'update
  // è già quello dopo l'incremento, l'unico che dice senza gare fra richieste
  // parallele quali unità cadono oltre la soglia. Non lancia.
  if (featureType === "whatsapp") {
    await registraConsumoExtra(organizationId, tracker.whatsappCreditsUsed, amount);
  }

  // Avviso soglie, DOPO il consumo e non bloccante: il credito e' gia' stato
  // registrato correttamente, e un guasto del fornitore di posta non deve
  // trasformarsi in un'operazione fallita per l'agenzia.
  const { checkCreditThresholds } = await import("@/lib/notifications/credit-thresholds");
  await checkCreditThresholds(organizationId, featureType);
}
