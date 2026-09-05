"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, X } from "lucide-react";
import { BillingIntervalToggle } from "@/components/billing/billing-interval-toggle";
import { UpgradeButton } from "@/components/billing/upgrade-button";
import { CancelSubscriptionFlow } from "@/components/billing/cancel-subscription-flow";
import {
  formatEur,
  formatPlanPrice,
  getPlanPricing,
  planFeatureRows,
  PLANS,
  type BillingInterval,
  type PlanId,
} from "@/lib/plans";
import { cn } from "@/lib/utils";



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
          const prezzo = formatPlanPrice(plan, pricing.monthlyEquivalent);

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
                {prezzo.amount}
                {prezzo.suffix && (
                  <span className="text-sm font-normal text-muted-foreground">{prezzo.suffix}</span>
                )}
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

              {/* Le righe arrivano da `planFeatureRows`, non riscritte qui.

                  Questo elenco e quello del listino pubblico erano due copie
                  a mano: leggevano gli stessi dati ma decidevano ciascuno
                  quali righe mostrare, e aggiungere una funzione voleva dire
                  ricordarsi due file. Dimenticarne uno significa un listino
                  pubblico che promette cose diverse da quelle che l'agenzia
                  legge dopo aver pagato. */}
              <ul className="mt-3 flex-1 space-y-2 text-sm text-muted-foreground">
                {planFeatureRows(plan).map((riga) => (
                  <li key={riga.label} className="flex items-center gap-2">
                    {typeof riga.value === "boolean" ? (
                      <>
                        {riga.value ? (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <X className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                        )}
                        {riga.label}
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                        <span>
                          {riga.label}: <span className="text-foreground">{riga.value}</span>
                        </span>
                      </>
                    )}
                  </li>
                ))}
                {plan.waConversationsOverageNote && (
                  <li className="text-xs">Oltre l&apos;incluso: {plan.waConversationsOverageNote}</li>
                )}
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
