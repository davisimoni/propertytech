"use client";

import { useState } from "react";
import { CheckCircle, ClipboardList, Loader2 } from "lucide-react";
import type { CancellationReason } from "@prisma/client";
import { CANCELLATION_REASON_LABELS, CANCELLATION_REASONS } from "@/lib/billing/cancellation";

export interface CancellationResult {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  mocked: boolean;
}

interface CancellationSurveyModalProps {
  onConfirm: (reason: CancellationReason, details: string) => void;
  onClose: () => void;
  isSubmitting: boolean;
  error: string | null;
  result: CancellationResult | null;
}

const DATE_FORMAT = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Rome",
});

/**
 * Secondo modale del flusso di disdetta: il questionario "stile SaaS" prima
 * della conferma. Compare solo se l'agenzia ha rifiutato lo sconto di
 * retention del primo modale.
 */
export function CancellationSurveyModal({
  onConfirm,
  onClose,
  isSubmitting,
  error,
  result,
}: CancellationSurveyModalProps) {
  const [reason, setReason] = useState<CancellationReason | null>(null);
  const [details, setDetails] = useState("");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancellation-modal-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
      >
        {result ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-blocked/10 text-status-blocked">
              <CheckCircle className="h-6 w-6" />
            </div>
            <h2 id="cancellation-modal-title" className="mt-4 text-lg font-semibold text-foreground">
              Abbonamento disdetto
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {result.mocked ? (
                "Richiesta registrata. La disdetta su Stripe verrà attivata automaticamente non appena l'integrazione sarà configurata."
              ) : result.currentPeriodEnd ? (
                <>
                  Resterà attivo fino al <strong className="text-foreground">{DATE_FORMAT.format(new Date(result.currentPeriodEnd))}</strong>, poi non verrà rinnovato.
                </>
              ) : (
                "Non verrà rinnovato alla prossima scadenza."
              )}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-all duration-200 hover:bg-muted"
            >
              Chiudi
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <ClipboardList className="h-4 w-4" />
              </div>
              <div>
                <h2 id="cancellation-modal-title" className="text-sm font-semibold text-foreground">
                  Prima di andare, aiutaci a capire perché
                </h2>
                <p className="text-xs text-muted-foreground">Un minuto, ci serve per migliorare.</p>
              </div>
            </div>

            <fieldset className="mt-5 space-y-2">
              <legend className="text-xs font-medium text-muted-foreground">
                Qual è il motivo principale?
              </legend>
              {CANCELLATION_REASONS.map((option) => (
                <label
                  key={option}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border p-2.5 text-sm text-foreground transition-all duration-200 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input
                    type="radio"
                    name="cancellation-reason"
                    value={option}
                    checked={reason === option}
                    onChange={() => setReason(option)}
                    className="h-4 w-4 accent-primary"
                  />
                  {CANCELLATION_REASON_LABELS[option]}
                </label>
              ))}
            </fieldset>

            <div className="mt-4">
              <label htmlFor="cancellation-details" className="text-xs font-medium text-muted-foreground">
                Vuoi aggiungere qualche dettaglio? (facoltativo)
              </label>
              <textarea
                id="cancellation-details"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Raccontaci cosa è mancato o cosa possiamo migliorare…"
                className="mt-1 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-base text-foreground sm:text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {error && (
              <p role="alert" className="mt-3 text-sm text-status-blocked">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => reason && onConfirm(reason, details.trim())}
                disabled={!reason || isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-status-blocked px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:brightness-110 disabled:opacity-50"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? "Conferma in corso…" : "Conferma Cancellazione"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-muted disabled:opacity-50"
              >
                Ripensandoci, mantieni l&apos;abbonamento
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
