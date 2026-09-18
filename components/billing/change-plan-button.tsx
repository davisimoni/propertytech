"use client";

import { ArrowLeftRight, Loader2 } from "lucide-react";
import { useBillingPortal } from "@/components/billing/use-billing-portal";
import { cn } from "@/lib/utils";

/**
 * Cambio piano per chi un abbonamento ce l'ha già.
 *
 * # Perché non passa dal Checkout
 *
 * Perché il Checkout **crea** un abbonamento, non lo sostituisce. Un'agenzia
 * su Starter che completasse un Checkout per il Professional si ritroverebbe
 * due abbonamenti attivi sullo stesso cliente Stripe, e pagherebbe entrambi:
 * nessun errore comparirebbe da nessuna parte, e la piattaforma mostrerebbe
 * il piano dell'ultimo arrivato.
 *
 * Il portale invece sostituisce il prezzo sull'abbonamento esistente,
 * calcola il conguaglio e ci manda l'evento che il webhook sa leggere dai
 * prezzi. È la stessa operazione che si poteva già fare a mano in dashboard,
 * fatta dall'agenzia in tre clic.
 */
export function ChangePlanButton({ label, className }: { label: string; className?: string }) {
  const { apri, inCorso } = useBillingPortal();

  return (
    <button
      type="button"
      onClick={apri}
      disabled={inCorso}
      className={cn("btn-outline w-full", className)}
    >
      {inCorso ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}
