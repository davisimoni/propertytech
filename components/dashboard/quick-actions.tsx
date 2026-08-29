"use client";

import { useState } from "react";
import Link from "next/link";
import { FileUp, Mic, type LucideIcon } from "lucide-react";
import { useUsageStats } from "@/hooks/use-usage-stats";
import { UpgradeLimitModal } from "@/components/billing/upgrade-limit-modal";
import type { UsageFeature } from "@/lib/usage-types";

interface QuickAction {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  feature: UsageFeature;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    href: "/documents",
    label: "Carica Documento",
    description: "Analizza una Visura, Atto o Planimetria",
    icon: FileUp,
    feature: "documents",
  },
  {
    href: "/voice-reports",
    label: "Registra Nota Vocale",
    description: "Genera un report venditore post-visita",
    icon: Mic,
    feature: "voice",
  },
];

export function QuickActions() {
  const { data } = useUsageStats();
  const [blockedFeature, setBlockedFeature] = useState<UsageFeature | null>(null);

  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-5">
      <h2 className="text-sm font-semibold text-foreground">Azioni Rapide</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          const isBlocked = data?.[action.feature]?.isLimitReached ?? false;

          if (isBlocked) {
            return (
              <button
                key={action.href}
                type="button"
                onClick={() => setBlockedFeature(action.feature)}
                className="flex items-start gap-3 rounded-xl border border-dashed border-border p-4 text-left opacity-60 transition-all duration-200 hover:bg-muted"
              >
                <div className="flex h-11 w-11 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{action.label}</p>
                  <p className="text-sm text-muted-foreground">Limite raggiunto — esegui l&apos;upgrade</p>
                </div>
              </button>
            );
          }

          return (
            <Link
              key={action.href}
              href={action.href}
              className="flex items-start gap-3 rounded-lg border border-border p-4 transition-all duration-200 hover:bg-muted"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{action.label}</p>
                <p className="text-sm text-muted-foreground">{action.description}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {blockedFeature && (
        <UpgradeLimitModal feature={blockedFeature} onNavigateAway={() => setBlockedFeature(null)} />
      )}
    </div>
  );
}
