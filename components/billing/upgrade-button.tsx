"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { BillingInterval, PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";

interface UpgradeButtonProps {
  plan: Exclude<PlanId, "trial">;
  /** Un visitatore non autenticato va prima registrato, portandosi dietro il piano scelto. */
  isLoggedIn: boolean;
  label: string;
  interval?: BillingInterval;
  variant?: "solid" | "outline";
  className?: string;
}

/**
 * Avvia il pagamento del piano.
 *
 * Non autenticato → `/register?plan=…`, così dopo la registrazione il piano
 * scelto non va riselezionato. Autenticato → sessione di Stripe Checkout.
 */
export function UpgradeButton({
  plan,
  isLoggedIn,
  label,
  interval = "monthly",
  variant = "solid",
  className,
}: UpgradeButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!isLoggedIn) {
      // La periodicità scelta viaggia con il piano: dopo la registrazione
      // l'utente non deve riselezionarla.
      router.push(`/register?plan=${plan}&interval=${interval}`);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "Impossibile avviare il pagamento.");
        setIsLoading(false);
        return;
      }

      // Redirect completo, non router.push: la destinazione è un dominio Stripe.
      window.location.href = body.url as string;
    } catch {
      setError("Errore di rete. Riprova.");
      setIsLoading(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className={cn(
          "inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 disabled:opacity-50",
          variant === "solid"
            ? "bg-brand-gradient text-white shadow-sm hover:shadow-md hover:brightness-110"
            : "border border-border text-foreground hover:border-primary/40 hover:bg-muted"
        )}
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {isLoading ? "Apertura pagamento…" : label}
      </button>

      {error && (
        <p role="alert" className="text-xs text-status-blocked">
          {error}
        </p>
      )}
    </div>
  );
}
