import { Info } from "lucide-react";
import { AI_DISCLAIMER } from "@/lib/compliance";
import { cn } from "@/lib/utils";

/**
 * Disclaimer sugli output generati dall'AI.
 *
 * Deliberatamente privo di `print:hidden`: quando il report viene esportato in
 * PDF e consegnato al proprietario dell'immobile, il disclaimer deve
 * accompagnare il documento — è proprio lì che serve.
 */
export function AiDisclaimer({
  className,
  variant = "block",
}: {
  className?: string;
  /** `inline` per una nota discreta sotto un risultato, `block` per un riquadro. */
  variant?: "block" | "inline";
}) {
  if (variant === "inline") {
    return (
      <p className={cn("flex items-start gap-1.5 text-xs text-muted-foreground", className)}>
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{AI_DISCLAIMER}</span>
      </p>
    );
  }

  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3.5",
        className
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="text-xs leading-relaxed text-muted-foreground">{AI_DISCLAIMER}</p>
    </div>
  );
}
