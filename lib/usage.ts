import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PLANS, type PlanId } from "@/lib/plans";
import { isDevPaywallBypassEnabled } from "@/lib/env";
import type { UsageFeature, UsageMetric, UsageStatsResponse } from "@/lib/usage-types";

const FEATURE_RESOURCE: Record<UsageFeature, string> = {
  whatsapp: "wa_conversations",
  documents: "doc_extractions",
  voice: "voice_reports",
};

const FEATURE_USAGE_FIELD = {
  whatsapp: "whatsappCreditsUsed",
  documents: "docCreditsUsed",
  voice: "voiceCreditsUsed",
} as const;

const FEATURE_LIMIT_FIELD = {
  whatsapp: "waConversationsLimit",
  documents: "ocrDocumentsLimit",
  voice: "voiceReportsLimit",
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

  const whatsapp = computeMetric(usage?.whatsappCreditsUsed ?? 0, plan[FEATURE_LIMIT_FIELD.whatsapp]);
  const documents = computeMetric(usage?.docCreditsUsed ?? 0, plan[FEATURE_LIMIT_FIELD.documents]);
  const voice = computeMetric(usage?.voiceCreditsUsed ?? 0, plan[FEATURE_LIMIT_FIELD.voice]);

  return {
    planId,
    planName: plan.name,
    whatsapp,
    documents,
    voice,
    hasAnyLimitReached: whatsapp.isLimitReached || documents.isLimitReached || voice.isLimitReached,
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

  await prisma.usageTracker.update({
    where: { organizationId },
    data: { [field]: { increment: amount } },
  });
}
