"use client";

import { useState } from "react";
import { useToast } from "@/components/shared/toast-provider";

/**
 * Apre il portale clienti di Stripe.
 *
 * La sessione si chiede al server al momento del clic e vive pochi minuti:
 * per questo non è un `<a href>` con un indirizzo pronto, ma una chiamata che
 * prima la crea e poi ci manda.
 *
 * Sta in un hook e non dentro un pulsante perché i punti che portano al
 * portale sono due, e diventeranno tre: le fatture e il cambio piano. Copiare
 * questa ventina di righe significa che il prossimo ritocco ne aggiusta una e
 * dimentica l'altra.
 */
export function useBillingPortal(): { apri: () => Promise<void>; inCorso: boolean } {
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
        // `window.location.href` e non `router.push`: la destinazione è un
        // dominio di Stripe, fuori dall'applicazione.
        window.location.href = body.url;
        return;
      }

      showToast(body?.message ?? "Non siamo riusciti ad aprire la gestione dell'abbonamento.", "error");
    } catch {
      showToast("Errore di rete: riprova fra poco.", "error");
    } finally {
      // Non si azzera in caso di successo: la pagina sta già cambiando, e un
      // pulsante che torna attivo inviterebbe a premerlo una seconda volta.
      setInCorso(false);
    }
  }

  return { apri, inCorso };
}
