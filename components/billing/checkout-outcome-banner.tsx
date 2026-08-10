"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { CheckCircle2, Info } from "lucide-react";

/**
 * Esito del ritorno da Stripe Checkout.
 *
 * Al successo forza un refresh della sessione: il piano viene attivato dal
 * webhook lato server, quindi il JWT del browser porta ancora quello vecchio e
 * l'header mostrerebbe il piano precedente fino al logout.
 */
export function CheckoutOutcomeBanner() {
  const params = useSearchParams();
  const outcome = params.get("checkout");
  const { update } = useSession();

  useEffect(() => {
    if (outcome === "success") update();
  }, [outcome, update]);

  if (outcome !== "success" && outcome !== "cancelled") return null;

  if (outcome === "cancelled") {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Pagamento annullato. Nessun addebito è stato effettuato e il tuo piano non è cambiato.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-status-qualified/30 bg-status-qualified/10 p-4">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-qualified" />
      <div>
        <p className="text-sm font-medium text-foreground">Pagamento completato</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Il nuovo piano viene attivato entro pochi secondi dalla conferma di Stripe. Se i crediti
          non risultano aggiornati, ricarica la pagina.
        </p>
      </div>
    </div>
  );
}
