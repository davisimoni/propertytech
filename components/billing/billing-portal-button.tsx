"use client";

import { useState } from "react";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { useToast } from "@/components/shared/toast-provider";

/**
 * Porta al portale clienti Stripe.
 *
 * La sessione si chiede al server al momento del clic e si vive pochi minuti:
 * per questo non è un `<a href>` con un indirizzo pronto, ma un pulsante che
 * prima la crea e poi ci manda.
 *
 * `window.location.href` e non `router.push`: la destinazione è un dominio di
 * Stripe, fuori dall'applicazione.
 */
export function BillingPortalButton() {
  const [inCorso, setInCorso] = useState(false);
  const { showToast } = useToast();

  async function apri() {
    setInCorso(true);

    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      const body = (await response.json().catch(() => null)) as
        | { url?: string; message?: string }
        | null;

      if (response.ok && body?.url) {
        window.location.href = body.url;
        return;
      }

      showToast(body?.message ?? "Non siamo riusciti ad aprire la gestione fatture.", "error");
    } catch {
      showToast("Errore di rete: riprova fra poco.", "error");
    } finally {
      // Non si azzera in caso di successo: la pagina sta già cambiando, e un
      // pulsante che torna attivo inviterebbe a premerlo una seconda volta.
      setInCorso(false);
    }
  }

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
