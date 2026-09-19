import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PLANS, type Plan, type PlanId } from "@/lib/plans";
import { isDevPaywallBypassEnabled } from "@/lib/env";

/**
 * Funzionalità sbloccate dal piano anziché consumate a crediti.
 * Il Social Multiplier e il Voice Seller-Reporting sono esclusivi del piano
 * Enterprise / Enterprise (CLAUDE.md §4).
 */
export type GatedFeature = "socialMultiplier" | "voiceSellerReporting" | "documentVault";

const FEATURE_RESOURCE: Record<GatedFeature, string> = {
  socialMultiplier: "social_multiplier",
  voiceSellerReporting: "voice_seller_reporting",
  documentVault: "document_vault",
};

/**
 * Piano più economico **acquistabile** che include la funzionalità.
 *
 * Calcolato anziché scritto a mano: il fascicolo documentale parte da Starter,
 * il Social Multiplier da Enterprise, e un valore fisso manderebbe metà degli
 * utenti al piano sbagliato. `PLANS` è dichiarato dal più economico al più
 * caro, quindi il primo che soddisfa la condizione è anche il meno costoso.
 *
 * Il Trial è escluso di proposito: non è una destinazione di upgrade ma il
 * punto di partenza. Da quando concede un assaggio a crediti del
 * Voice Seller-Reporting — funzione che su Starter e Professional torna
 * chiusa — includerlo qui direbbe a un cliente pagante di "passare al piano
 * Free Trial", cioè di retrocedere.
 */
function cheapestPlanWith(feature: GatedFeature): Plan {
  return Object.values(PLANS).find((plan) => plan.id !== "trial" && plan[feature]) ?? PLANS.enterprise;
}

export async function getPlanId(organizationId: string): Promise<PlanId> {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    select: { status: true },
  });

  return (subscription?.status ?? "trial") as PlanId;
}

/**
 * Il piano di chi sta navigando, letto dal database e non dal token.
 *
 * # Perché non `session.user.planId`
 *
 * Perché il token di sessione fotografa il piano al momento del login e non
 * sa dei cambi fatti dopo, dal Checkout o dal Portale Clienti: il webhook
 * aggiorna il database, non i cookie di chi è già collegato. Per decidere cosa
 * mostrare o sbloccare vale solo questo. Con il token, un'agenzia appena scesa
 * di piano avrebbe tenuto i bonus del piano superiore fino al logout, e una
 * appena abbonata avrebbe visto il Checkout invece del portale, aprendo un
 * secondo abbonamento accanto al primo.
 *
 * Il `planId` del token resta per l'intestazione, dove un ritardo di qualche
 * secondo è solo estetico.
 */
export async function pianoCorrente(organizationId: string | null | undefined): Promise<PlanId> {
  return organizationId ? getPlanId(organizationId) : "trial";
}

/**
 * Route guard per le funzionalità legate al piano. Restituisce una 402 pronta
 * quando il piano non include la funzionalità, `null` quando si può procedere.
 *
 * Usa lo stesso status 402 e la stessa forma di payload del superamento crediti,
 * così la UI può intercettarlo con un unico gestore (CLAUDE.md §4).
 */
export async function checkFeatureAccess(
  organizationId: string,
  feature: GatedFeature
): Promise<NextResponse | null> {
  if (isDevPaywallBypassEnabled()) {
    console.warn("[feature-access] DEV_BYPASS_PAYWALL attivo: gate ignorato", { organizationId, feature });
    return null;
  }

  const planId = await getPlanId(organizationId);

  if (!PLANS[planId][feature]) {
    return NextResponse.json(
      {
        error: "feature_not_in_plan",
        resource: FEATURE_RESOURCE[feature],
        requiredPlan: cheapestPlanWith(feature).name,
      },
      { status: 402 }
    );
  }

  return null;
}
