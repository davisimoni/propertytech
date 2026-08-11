"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CancellationReason } from "@prisma/client";
import { RetentionOfferModal } from "@/components/billing/retention-offer-modal";
import {
  CancellationSurveyModal,
  type CancellationResult,
} from "@/components/billing/cancellation-survey-modal";

type Step = "closed" | "retention" | "survey";

/**
 * Flusso di disdetta a due passaggi: prima l'offerta di retention, poi — solo
 * se rifiutata — il questionario di cancellazione.
 *
 * Il trigger è un link testuale discreto, non un bottone in evidenza: vive
 * accanto al piano attuale in PlanGrid e non va promosso visivamente, la
 * disdetta non è un'azione da incoraggiare.
 */
export function CancelSubscriptionFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("closed");

  const [isRetentionSubmitting, setIsRetentionSubmitting] = useState(false);
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const [retentionAccepted, setRetentionAccepted] = useState(false);
  const [retentionMocked, setRetentionMocked] = useState(false);

  const [isCancelSubmitting, setIsCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancellationResult, setCancellationResult] = useState<CancellationResult | null>(null);

  function close() {
    setStep("closed");
    // Stato pulito per la prossima apertura: altrimenti riaprendo il modale
    // dopo una disdetta confermata si rivedrebbe la schermata di successo.
    setRetentionError(null);
    setRetentionAccepted(false);
    setCancelError(null);
    setCancellationResult(null);
    router.refresh();
  }

  async function handleAcceptRetention() {
    setIsRetentionSubmitting(true);
    setRetentionError(null);

    try {
      const response = await fetch("/api/stripe/retention", { method: "POST" });
      const body = await response.json();

      if (!response.ok) {
        setRetentionError(body.message ?? "Impossibile applicare lo sconto. Riprova.");
        return;
      }

      setRetentionMocked(Boolean(body.mocked));
      setRetentionAccepted(true);
    } catch {
      setRetentionError("Errore di rete. Riprova.");
    } finally {
      setIsRetentionSubmitting(false);
    }
  }

  async function handleConfirmCancellation(reason: CancellationReason, details: string) {
    setIsCancelSubmitting(true);
    setCancelError(null);

    try {
      const response = await fetch("/api/stripe/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, details: details || undefined }),
      });
      const body = await response.json();

      if (!response.ok) {
        setCancelError(body.message ?? "Impossibile completare la disdetta. Riprova.");
        return;
      }

      setCancellationResult({
        cancelAtPeriodEnd: Boolean(body.cancelAtPeriodEnd),
        currentPeriodEnd: body.currentPeriodEnd ?? null,
        mocked: Boolean(body.mocked),
      });
    } catch {
      setCancelError("Errore di rete. Riprova.");
    } finally {
      setIsCancelSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setStep("retention")}
        className="mt-5 w-full text-center text-xs text-muted-foreground underline-offset-2 transition-colors duration-200 hover:text-status-blocked hover:underline"
      >
        Annulla abbonamento
      </button>

      {step === "retention" && (
        <RetentionOfferModal
          onAccept={handleAcceptRetention}
          onDecline={() => {
            setRetentionError(null);
            setStep("survey");
          }}
          onClose={close}
          isSubmitting={isRetentionSubmitting}
          error={retentionError}
          accepted={retentionAccepted}
          mocked={retentionMocked}
        />
      )}

      {step === "survey" && (
        <CancellationSurveyModal
          onConfirm={handleConfirmCancellation}
          onClose={close}
          isSubmitting={isCancelSubmitting}
          error={cancelError}
          result={cancellationResult}
        />
      )}
    </>
  );
}
