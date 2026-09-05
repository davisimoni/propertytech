"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/components/shared/toast-provider";

/**
 * Rimanda al calendario le visite che non ci sono mai arrivate.
 *
 * # Perché un pulsante e non un recupero automatico
 *
 * Perché scrivere su un calendario altrui è un'azione visibile, e l'agenzia
 * deve poterla decidere: un recupero silenzioso che riempie l'agenda del
 * titolare di venticinque eventi mentre sta guardando la dashboard è
 * sgradevole anche quando è corretto.
 *
 * Ripremerlo non crea doppioni: la sincronizzazione si ferma sugli slot che
 * hanno già un `externalEventId`.
 */
export function ResyncCalendarButton({ quante }: { quante: number }) {
  const [inCorso, setInCorso] = useState(false);
  const { showToast } = useToast();
  const router = useRouter();

  async function resincronizza() {
    setInCorso(true);
    try {
      const response = await fetch("/api/calendar/sync-pending", { method: "POST" });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        showToast(body.message ?? "Sincronizzazione non riuscita.", "error");
        return;
      }

      const { trovate = 0, riuscite = 0 } = body as { trovate: number; riuscite: number };

      showToast(
        riuscite === 0
          ? "Nessuna visita sincronizzata: controlla che il calendario sia collegato in Impostazioni → Agende."
          : `${riuscite} ${riuscite === 1 ? "visita sincronizzata" : "visite sincronizzate"} su ${trovate}.`,
        riuscite === 0 ? "error" : "success"
      );

      // Ricarica i dati del server: i badge devono riflettere ciò che è appena
      // successo, non lo stato di quando la pagina è stata aperta.
      router.refresh();
    } catch {
      showToast("Errore di rete durante la sincronizzazione.", "error");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <button
      type="button"
      onClick={resincronizza}
      disabled={inCorso}
      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 text-xs font-medium text-primary transition-all duration-200 hover:bg-primary/10 disabled:opacity-50 sm:h-8"
    >
      {inCorso ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
      {inCorso
        ? "Sincronizzazione…"
        : `Sincronizza ${quante} ${quante === 1 ? "visita" : "visite"}`}
    </button>
  );
}
