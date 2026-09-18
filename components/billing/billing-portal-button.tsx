"use client";

import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { useBillingPortal } from "@/components/billing/use-billing-portal";

/** Porta al portale clienti Stripe, dove vivono fatture e metodo di pagamento. */
export function BillingPortalButton() {
  const { apri, inCorso } = useBillingPortal();

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <CreditCard className="h-4 w-4 text-primary" aria-hidden="true" />
            Fatture e metodo di pagamento
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Scarica le fatture, aggiorna la carta o i dati di fatturazione. Si apre il portale
            sicuro di Stripe: i dati della carta non passano mai da PropertyTech.
          </p>
        </div>

        <button
          type="button"
          onClick={apri}
          disabled={inCorso}
          className="btn-outline shrink-0 text-xs disabled:opacity-50"
        >
          {inCorso ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Gestisci Fatture e Metodo di Pagamento
        </button>
      </div>
    </section>
  );
}
