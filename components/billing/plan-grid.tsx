"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, X } from "lucide-react";
import { BillingIntervalToggle } from "@/components/billing/billing-interval-toggle";
import { UpgradeButton } from "@/components/billing/upgrade-button";
import { CancelSubscriptionFlow } from "@/components/billing/cancel-subscription-flow";
import {
  formatCount,
  formatEur,
  getPlanPricing,
  PLANS,
  type BillingInterval,
  type PlanId,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

function formatAgendas(limit: number | null): string {
  if (limit === null) return "Illimitate";
  if (limit === 0) return "—";
  return String(limit);
}

function formatOcr(limit: number | null): string {
  return limit === null ? "Illimitato" : `${limit} estratti`;
}

/**
 * Griglia dei piani in impostazioni.
 *
 * La periodicità iniziale è letta da `?interval=`: chi arriva dalla landing
 * dopo aver scelto l'annuale ritrova quella selezione già attiva.
 */
export function PlanGrid({ currentPlanId }: { currentPlanId: PlanId }) {
  const searchParams = useSearchParams();
  const requested = searchParams.get("interval");

  const [interval, setBillingInterval] = useState<BillingInterval>(
    requested === "yearly" ? "yearly" : "monthly"
  );

  return (
    <div>
      <BillingIntervalToggle value={interval} onChange={setBillingInterval} />

      <div className="mt-8 grid gap-4 lg:grid-cols-4">
        {Object.values(PLANS).map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const pricing = getPlanPricing(plan, interval);
          const isFree = plan.priceEurMonthly === null;

          return (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col rounded-xl border p-5",
                isCurrent ? "border-primary ring-1 ring-primary" : "border-border"
              )}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">{plan.name}</h2>
                {isCurrent && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    Piano attuale
                  </span>
                )}
              </div>

              <p className="mt-0.5 text-xs text-muted-foreground">{plan.audience}</p>

              <p className="mt-2 text-2xl font-semibold text-foreground">
                {isFree ? "Gratuito" : formatEur(pricing.monthlyEquivalent as number)}
                {!isFree && <span className="text-sm font-normal text-muted-foreground">/mese</span>}
              </p>

              <div className="mt-1 min-h-[2rem]">
                {!isFree && interval === "yearly" && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {formatEur(pricing.chargedAmount as number)} all&apos;anno
                    </p>
                    <p className="text-xs font-medium text-status-qualified">
                      Risparmi {formatEur(pricing.yearlySaving as number)}
                    </p>
                  </>
                )}
              </div>

              <ul className="mt-3 flex-1 space-y-2 text-sm text-muted-foreground">
                <li>
                  {formatCount(plan.waConversationsLimit)} conversazioni WA
                  {plan.id === "trial" ? " (totali)" : "/mese"}
                  {plan.waConversationsOverageNote && ` (${plan.waConversationsOverageNote})`}
                </li>
                <li>OCR: {formatOcr(plan.ocrDocumentsLimit)}</li>
                <li>
                  Postazioni:{" "}
                  {plan.seatsLimit === null ? "illimitate" : plan.seatsLimit}
                </li>
                <li>Agende: {formatAgendas(plan.agendasLimit)}</li>
                <li className="flex items-center gap-2">
                  {plan.documentVault ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <X className="h-4 w-4 text-muted-foreground/50" />
                  )}
                  Fascicolo documentale
                </li>
                <li className="flex items-center gap-2">
                  {plan.socialMultiplier ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <X className="h-4 w-4 text-muted-foreground/50" />
                  )}
                  Social Multiplier
                </li>
                <li className="flex items-center gap-2">
                  {plan.voiceSellerReporting ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <X className="h-4 w-4 text-muted-foreground/50" />
                  )}
                  Voice Seller-Reporting
                </li>
              </ul>

              {!isCurrent && plan.id !== "trial" && (
                <UpgradeButton
                  plan={plan.id}
                  interval={interval}
                  isLoggedIn
                  label={`Passa a ${plan.name}`}
                  className="mt-5"
                />
              )}

              {isCurrent && plan.id !== "trial" && <CancelSubscriptionFlow />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
