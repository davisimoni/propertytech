"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { BillingIntervalToggle } from "@/components/billing/billing-interval-toggle";
import { UpgradeButton } from "@/components/billing/upgrade-button";
import {
  formatEur,
  formatPlanPrice,
  getPlanPricing,
  planFeatureRows,
  PLANS,
  type BillingInterval,
} from "@/lib/plans";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/landing/section-heading";

/** Postazioni incluse, con il singolare corretto. */


export function PricingSection({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [interval, setBillingInterval] = useState<BillingInterval>("monthly");

  // I piani arrivano da lib/plans.ts: prezzi e limiti restano allineati a
  // quelli applicati davvero dal paywall.
  const plans = Object.values(PLANS);

  // Era l'unica sezione della landing senza `border-t`: da lì la sensazione di
  // essere incollata a "Come funziona". Il filo la riallinea al ritmo delle
  // altre, e il padding superiore maggiorato dà lo stacco fra la spiegazione e
  // il listino.
  return (
    <section id="prezzi" className="scroll-mt-20 border-t border-border pb-20 pt-24 sm:pt-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Piani"
          title="Un piano per ogni dimensione di agenzia"
          subtitle="Inizia gratis. Cambia o disdici quando vuoi, senza penali."
        />

        <BillingIntervalToggle value={interval} onChange={setBillingInterval} className="mt-8" />

        <div className="mt-10 grid gap-4 lg:grid-cols-4">
          {plans.map((plan) => {
            const isHighlighted = plan.id === "pro";
            const pricing = getPlanPricing(plan, interval);
            const isFree = plan.priceEurMonthly === null;
            const prezzo = formatPlanPrice(plan, pricing.monthlyEquivalent);

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-xl border bg-card p-6",
                  isHighlighted ? "border-primary shadow-lg ring-1 ring-primary" : "border-border"
                )}
              >
                {isHighlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-gradient px-3 py-1 text-xs font-semibold text-white shadow-sm">
                    Più scelto
                  </span>
                )}

                <h3 className="text-sm font-semibold text-foreground">{plan.name}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{plan.audience}</p>

                {/* Prezzo ed etichetta da `formatPlanPrice`, non decisi qui:
                    era l'ultima cosa che le due pagine sceglievano per conto
                    proprio, ed erano divergenti — "0€ per sempre" qui,
                    "Gratuito" nelle Impostazioni. */}
                <p className="mt-3 text-3xl font-bold text-foreground">
                  {prezzo.amount}
                  {prezzo.suffix && (
                    <span className="text-sm font-normal text-muted-foreground">
                      {prezzo.suffix}
                    </span>
                  )}
                </p>

                {/* Riga di dettaglio a altezza fissa: senza, le card dei piani
                    a pagamento e quella gratuita si disallineerebbero. */}
                <div className="mt-1 min-h-[2.5rem]">
                  {!isFree && interval === "yearly" && (
                    <>
                      <p className="text-xs text-muted-foreground">
                        {formatEur(pricing.chargedAmount as number)} fatturati una volta l&apos;anno
                      </p>
                      <p className="text-xs font-semibold text-status-qualified">
                        Risparmi {formatEur(pricing.yearlySaving as number)} l&apos;anno
                      </p>
                    </>
                  )}
                  {!isFree && interval === "monthly" && (
                    <p className="text-xs text-muted-foreground">Fatturazione mensile, disdetta libera</p>
                  )}
                </div>

                {/* Le stesse righe della scheda Piani nelle Impostazioni.

                    Erano due elenchi scritti a mano che leggevano gli stessi
                    dati: un listino pubblico che promette cose diverse da
                    quelle che l'agenzia legge dopo aver pagato e' il difetto
                    peggiore che possa avere una pagina prezzi, e con due copie
                    era solo questione di tempo. */}
                <ul className="mt-4 flex-1 space-y-2 text-sm">
                  {planFeatureRows(plan).map((riga) => {
                    const inclusa = riga.value !== false;
                    return (
                      <li
                        key={riga.label}
                        className={cn(
                          "flex items-start gap-2",
                          inclusa ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {inclusa ? (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-status-qualified" />
                        ) : (
                          <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
                        )}
                        <span>
                          {riga.label}
                          {typeof riga.value === "string" ? `: ${riga.value}` : ""}
                        </span>
                      </li>
                    );
                  })}
                  {plan.waConversationsOverageNote && (
                    <li className="pl-6 text-xs text-muted-foreground">
                      Oltre l&apos;incluso: {plan.waConversationsOverageNote}
                    </li>
                  )}
                </ul>

                {plan.id === "trial" ? (
                  <Link
                    href="/register"
                    className="mt-6 inline-flex items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
                  >
                    Inizia Gratis
                  </Link>
                ) : (
                  <UpgradeButton
                    plan={plan.id}
                    interval={interval}
                    isLoggedIn={isLoggedIn}
                    label={`Scegli ${plan.name}`}
                    variant={isHighlighted ? "solid" : "outline"}
                    className="mt-6"
                  />
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Tutti i piani includono trattamento dei dati in Unione Europea e conformità GDPR.
        </p>
      </div>
    </section>
  );
}
