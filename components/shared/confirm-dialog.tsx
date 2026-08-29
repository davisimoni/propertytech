"use client";

import { useEffect } from "react";
import { Loader2, TriangleAlert } from "lucide-react";

/**
 * Conferma per le azioni da cui non si torna.
 *
 * Sostituisce `window.confirm`, che funzionava ma aveva tre difetti concreti:
 * su mobile compare come avviso di sistema staccato dall'interfaccia, non si
 * può dire cosa si perde esattamente, e alcuni browser lo sopprimono dopo che
 * l'utente l'ha visto qualche volta — cioè proprio la protezione sparisce da
 * sé, in silenzio.
 *
 * # Il fuoco parte su Annulla
 *
 * Chi arriva qui con la tastiera, o preme Invio d'istinto dopo il click, non
 * deve cancellare nulla. Il pulsante distruttivo si raggiunge, ma va scelto.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Elimina definitivamente",
  cancelLabel = "Annulla",
  isWorking = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  /** Cosa succede davvero, in una frase. Non "sei sicuro?": quello lo sa già. */
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isWorking?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !isWorking) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, isWorking]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/60"
        onClick={isWorking ? undefined : onCancel}
        aria-hidden="true"
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="conferma-titolo"
        aria-describedby="conferma-descrizione"
        className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-blocked/10 text-status-blocked">
            <TriangleAlert className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 id="conferma-titolo" className="text-sm font-semibold text-foreground">
              {title}
            </h2>
            <p
              id="conferma-descrizione"
              className="mt-1 text-sm leading-relaxed text-muted-foreground"
            >
              {description}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            disabled={isWorking}
            className="btn-outline text-xs disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isWorking}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-status-blocked px-3 text-xs font-medium text-white transition-all duration-200 hover:opacity-90 disabled:opacity-50 sm:h-9"
          >
            {isWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
