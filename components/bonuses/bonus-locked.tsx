"use client";

import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { ChangePlanButton } from "@/components/billing/change-plan-button";
import { UpgradeButton } from "@/components/billing/upgrade-button";
import type { Bonus } from "@/lib/bonuses";
import { PLANS, type PlanId } from "@/lib/plans";

/**
 * Quello che si vede aprendo un bonus che il piano non comprende.
 *
 * Non un errore e non una porta chiusa: si racconta cosa fa lo strumento e si
 * offre la strada per averlo. Chi arriva qui ci è arrivato apposta, spesso da
 * un link o dalla scheda del bonus, e trattarlo come un accesso negato
 * significherebbe rispondere a un interesse con uno sportello chiuso.
 */
export function BonusLocked({
  bonus,
  currentPlanId,
}: {
  bonus: Bonus;
  currentPlanId: PlanId;
}) {
  const pianoRichiesto = PLANS[bonus.plan];

  return (
    <div className="space-y-4">
      <Link
        href="/bonuses"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Tutti i bonus
      </Link>

      <section className="rounded-xl border border-border bg-card p-5 md:p-6">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Lock className="h-4 w-4" aria-hidden="true" />
        </span>

        <h1 className="mt-4 text-lg font-semibold text-foreground">{bonus.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{bonus.description}</p>

        <p className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground">
          Incluso nel piano <strong className="font-semibold">{pianoRichiesto.name}</strong>.
        </p>

        <div className="mt-5">
          {currentPlanId === "trial" ? (
            <UpgradeButton
              plan={bonus.plan}
              isLoggedIn
              label={`Sblocca con ${pianoRichiesto.name}`}
              className="w-full sm:w-auto"
            />
          ) : (
            <ChangePlanButton
              label={`Sblocca con ${pianoRichiesto.name}`}
              className="sm:w-auto"
            />
          )}
        </div>
      </section>
    </div>
  );
}
