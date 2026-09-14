"use client";

import { useState } from "react";
import { Loader2, MessageSquarePlus, X } from "lucide-react";
import { EXTRA_CREDITS_PACK_SIZE, formatCount } from "@/lib/plans";
import { useToast } from "@/components/shared/toast-provider";

/**
 * Acquisto di un pacchetto di conversazioni aggiuntive.
 *
 * # Perché non mostra il prezzo
 *
 * Perché il prezzo lo conosce solo Stripe, e lo mostra lui nella pagina di
 * pagamento prima che l'agente confermi. Scriverlo anche qui significherebbe
 * poterlo cambiare su Stripe e continuare a mostrarne un altro in
 * applicazione — la classe di errore peggiore su una schermata di acquisto.
 */
export function RechargeCreditsDialog({
  restanti,
  onClose,
}: {
  /** Conversazioni ancora disponibili, per dire all'agente perché è qui. */
  restanti: number | null;
  onClose: () => void;
}) {
  const [inCorso, setInCorso] = useState(false);
  const { showToast } = useToast();

  async function acquista() {
    setInCorso(true);

    try {
      const response = await fetch("/api/stripe/recharge-credits", { method: "POST" });
      const body = (await response.json().catch(() => null)) as
        | { url?: string; message?: string }
        | null;

      if (response.ok && body?.url) {
        // Destinazione su dominio Stripe: navigazione vera, non router.push.
        window.location.href = body.url;
        return;
      }

      showToast(body?.message ?? "Non siamo riusciti ad avviare il pagamento.", "error");
      setInCorso(false);
    } catch {
      showToast("Errore di rete: riprova fra poco.", "error");
      setInCorso(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Acquista crediti extra"
      className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center"
    >
      <div className="fixed inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Acquista crediti extra</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {restanti !== null && restanti <= 0
                  ? "Hai esaurito le conversazioni del tuo piano: l'assistente non sta più rispondendo ai nuovi contatti."
                  : restanti !== null
                    ? `Ti restano ${formatCount(restanti)} conversazioni su questo piano.`
                    : "Aggiungi conversazioni al tuo piano."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-8 sm:w-8"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-sm font-medium text-foreground">
            Pacchetto da {formatCount(EXTRA_CREDITS_PACK_SIZE)} conversazioni
          </p>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
            <li>· Pagamento una tantum: nessun abbonamento, nessun rinnovo automatico.</li>
            <li>· Si sommano al piano e restano finché non li usi.</li>
            <li>· Il prezzo te lo mostra Stripe prima di confermare.</li>
          </ul>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-outline text-xs">
            Non ora
          </button>
          <button
            type="button"
            onClick={acquista}
            disabled={inCorso}
            className="btn-brand text-xs disabled:opacity-50"
          >
            {inCorso ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Vai al pagamento
          </button>
        </div>
      </div>
    </div>
  );
}
