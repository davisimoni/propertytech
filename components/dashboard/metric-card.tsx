import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  /** Riga sotto il valore: da cosa deriva il numero. */
  hint?: string;
  /** Evidenzia la card come indicatore principale. */
  highlighted?: boolean;
  className?: string;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  hint,
  highlighted = false,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border p-5",
        highlighted ? "border-primary/30 bg-primary/5" : "border-border bg-card",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            highlighted ? "bg-brand-gradient text-white shadow-sm" : "bg-primary/10 text-primary"
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </div>
  );
}
