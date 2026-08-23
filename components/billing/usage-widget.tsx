"use client";

import { AlertTriangle } from "lucide-react";
import { useUsageStats } from "@/hooks/use-usage-stats";
import { formatCount } from "@/lib/plans";
import { cn } from "@/lib/utils";
import type { UsageMetric } from "@/lib/usage-types";

/** Come nel listino: "1.500" e non "1500", stessa cifra scritta allo stesso modo ovunque compaia. */
function formatLimit(limit: number | null): string {
  return limit === null ? "∞" : formatCount(limit);
}

function LimitBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-status-blocked/10 px-2 py-0.5 text-xs font-semibold text-status-blocked">
      <AlertTriangle className="h-3 w-3" />
      Limiti Raggiunti
    </span>
  );
}

function UsageBar({ label, metric }: { label: string; metric: UsageMetric }) {
  const percent = metric.limit === null ? 0 : Math.min((metric.used / metric.limit) * 100, 100);

  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={cn(
            "font-medium",
            metric.isLimitReached ? "text-status-blocked" : "text-foreground"
          )}
        >
          {formatCount(metric.used)}/{formatLimit(metric.limit)} usati
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            metric.isLimitReached ? "bg-status-blocked" : "bg-brand-gradient"
          )}
          style={{ width: metric.limit === null ? "100%" : `${percent}%` }}
        />
      </div>
    </div>
  );
}

interface UsageWidgetProps {
  variant?: "full" | "compact";
}

export function UsageWidget({ variant = "full" }: UsageWidgetProps) {
  const { data, isLoading } = useUsageStats();

  if (isLoading || !data) {
    return <div className={cn("animate-pulse rounded-xl bg-muted", variant === "compact" ? "h-5 w-40" : "h-24")} />;
  }

  if (variant === "compact") {
    return (
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {/* `truncate` e `whitespace-nowrap`: in un header alto 56px una
            scritta che va a capo esce dal contenitore invece di adattarsi. */}
        <span className="truncate whitespace-nowrap font-medium text-foreground">
          Piano {data.planName}
        </span>
        {data.hasAnyLimitReached ? (
          <LimitBadge />
        ) : (
          <span className="hidden text-muted-foreground sm:inline">
            — {formatCount(data.whatsapp.used)}/{formatLimit(data.whatsapp.limit)} conversazioni WA
            usate
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="card-surface space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Crediti Piano {data.planName}
        </span>
        {data.hasAnyLimitReached && <LimitBadge />}
      </div>
      <UsageBar label="Crediti WhatsApp" metric={data.whatsapp} />
      <UsageBar label="Crediti Documenti" metric={data.documents} />
      {data.voice.limit !== 0 && <UsageBar label="Note Vocali" metric={data.voice} />}
    </div>
  );
}
