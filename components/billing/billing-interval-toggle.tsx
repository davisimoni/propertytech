"use client";

import type { BillingInterval } from "@/lib/plans";
import { YEARLY_DISCOUNT_LABEL } from "@/lib/plans";
import { cn } from "@/lib/utils";

interface BillingIntervalToggleProps {
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
  className?: string;
}

const OPTIONS: { value: BillingInterval; label: string }[] = [
  { value: "monthly", label: "Mensile" },
  { value: "yearly", label: "Annuale" },
];

/** Selettore della periodicità di fatturazione, con evidenza dello sconto. */
export function BillingIntervalToggle({ value, onChange, className }: BillingIntervalToggleProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div
        role="radiogroup"
        aria-label="Periodicità di fatturazione"
        className="inline-flex rounded-xl border border-border bg-card p-1"
      >
        {OPTIONS.map((option) => {
          const isActive = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onChange(option.value)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-brand-gradient text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
              {option.value === "yearly" && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold transition-colors duration-200",
                    isActive ? "bg-white/20 text-white" : "bg-status-qualified/15 text-status-qualified"
                  )}
                >
                  −{YEARLY_DISCOUNT_LABEL}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {value === "yearly"
          ? `Fatturazione annuale: risparmi il ${YEARLY_DISCOUNT_LABEL} rispetto al mensile.`
          : `Passa all'annuale e risparmia il ${YEARLY_DISCOUNT_LABEL}.`}
      </p>
    </div>
  );
}
