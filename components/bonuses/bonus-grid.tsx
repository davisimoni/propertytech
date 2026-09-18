"use client";

import Link from "next/link";
import { ArrowRight, Gift, Lock } from "lucide-react";
import { ChangePlanButton } from "@/components/billing/change-plan-button";
import { UpgradeButton } from "@/components/billing/upgrade-button";
import { BONUSES, bonusAccessibile } from "@/lib/bonuses";
import { PLANS, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";

/**
 * Le schede dei bonus, aperte o chiuse a seconda del piano.
 *
 * # Perché il bonus chiuso si vede lo stesso
 *
 * Perché nasconderlo lo renderebbe invisibile anche a chi lo comprerebbe. Si
 * vede cosa fa e a quale piano appartiene, con il pulsante che porta al
 * cambio piano: chi è sul Trial passa dal Checkout, chi ha già un abbonamento
 * dal portale Stripe, che sostituisce il prezzo invece di aprire un secondo
 * abbonamento accanto al primo.
 */
export function BonusGrid({ currentPlanId }: { currentPlanId: PlanId }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {BONUSES.map((bonus) => {
        const sbloccato = bonusAccessibile(currentPlanId, bonus.id);
        const pianoRichiesto = PLANS[bonus.plan];

        return (
          <article
            key={bonus.id}
            className={cn(
              "flex flex-col rounded-xl border bg-card p-5",
              sbloccato ? "border-primary/30" : "border-border"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className={cn(
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  sbloccato ? "bg-brand-gradient text-white" : "bg-muted text-muted-foreground"
                )}
              >
                {sbloccato ? (
                  <Gift className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Lock className="h-4 w-4" aria-hidden="true" />
                )}
              </span>

              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  sbloccato
                    ? "bg-status-qualified/10 text-status-qualified"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {sbloccato ? "Incluso nel tuo piano" : `Riservato a Piano ${pianoRichiesto.name}`}
              </span>
            </div>

            <h2 className="mt-4 text-sm font-semibold text-foreground">{bonus.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{bonus.description}</p>

            {/* Il problema che risolve, non un elenco di funzioni: è la riga
                in cui l'agente si riconosce, ed è quella che fa aprire lo
                strumento invece di scorrerlo. */}
            <p className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs italic text-muted-foreground">
              {bonus.problem}
            </p>

            <div className="mt-5 pt-1">
              {sbloccato ? (
                <Link href={bonus.href} className="btn-brand w-full text-sm">
                  {bonus.action}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              ) : currentPlanId === "trial" ? (
                <UpgradeButton
                  plan={bonus.plan}
                  isLoggedIn
                  label={`Sblocca con ${pianoRichiesto.name}`}
                  variant="outline"
                  className="w-full"
                />
              ) : (
                <ChangePlanButton label={`Sblocca con ${pianoRichiesto.name}`} />
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
