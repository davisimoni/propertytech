"use client";

import { useEffect, useRef } from "react";
import { Loader2, PartyPopper, Sparkles } from "lucide-react";

interface RetentionOfferModalProps {
  onAccept: () => void;
  onDecline: () => void;
  onClose: () => void;
  isSubmitting: boolean;
  error: string | null;
  accepted: boolean;
  mocked: boolean;
}

/**
 * Primo modale del flusso di disdetta: propone lo sconto -50% a vita prima
 * di lasciar procedere verso il questionario.
 *
 * A differenza del paywall (UpgradeLimitModal) è chiudibile: qui l'agenzia
 * non ha ancora chiesto nulla di irreversibile, bloccarla sarebbe una
 * punizione per aver solo guardato l'opzione di disdetta.
 */
export function RetentionOfferModal({
  onAccept,
  onDecline,
  onClose,
  isSubmitting,
  error,
  accepted,
  mocked,
}: RetentionOfferModalProps) {
  const acceptRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    acceptRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="retention-modal-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-lg"
      >
        {accepted ? (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-qualified/10 text-status-qualified">
              <PartyPopper className="h-6 w-6" />
            </div>
            <h2 id="retention-modal-title" className="mt-4 text-lg font-semibold text-foreground">
              Sconto applicato
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {mocked
                ? "Registrato: appena le chiavi Stripe saranno configurate, il -50% a vita verrà applicato automaticamente al tuo abbonamento."
                : "Il -50% a vita è già attivo: lo vedrai riflesso a partire dal prossimo addebito."}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-xl bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110"
            >
              Fantastico, chiudi
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <h2 id="retention-modal-title" className="mt-4 text-lg font-semibold text-foreground">
              Aspetta, un&apos;offerta prima di andare
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Ti offriamo uno <strong className="text-foreground">sconto del 50% a vita</strong> su
              qualsiasi piano, da subito. Nessun vincolo aggiuntivo: resta con noi a metà prezzo.
            </p>

            {error && (
              <p role="alert" className="mt-3 text-xs text-status-blocked">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-col gap-2">
              <button
                ref={acceptRef}
                type="button"
                onClick={onAccept}
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 disabled:opacity-50"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? "Applicazione in corso…" : "Accetta offerta (-50%)"}
              </button>
              <button
                type="button"
                onClick={onDecline}
                disabled={isSubmitting}
                className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-muted disabled:opacity-50"
              >
                No grazie, voglio proseguire con la cancellazione
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
