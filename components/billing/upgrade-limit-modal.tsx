"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Lock } from "lucide-react";
import type { UsageFeature } from "@/lib/usage-types";

/** Funzionalità sbloccate dal piano, senza contatore crediti. */
export type LockedFeature = "social" | "voice-reports" | "agendas" | "document-vault" | "seats";

export type PaywallFeature = UsageFeature | LockedFeature;

const FEATURE_LABEL: Record<PaywallFeature, string> = {
  whatsapp: "conversazioni WhatsApp",
  documents: "estrazioni documento",
  voice: "note vocali",
  social: "Social & Annunci",
  "voice-reports": "Report Venditori",
  agendas: "Agende",
  "document-vault": "Fascicolo documentale",
  seats: "Postazioni",
};

/** Testo specifico per funzionalità che scalano col piano anziché essere binarie. */
const LOCKED_COPY: Partial<Record<PaywallFeature, string>> = {
  agendas:
    "Hai raggiunto il numero di agende incluse nel tuo piano. Esegui l'upgrade per gestire più agenti.",
};

interface UpgradeLimitModalProps {
  feature: PaywallFeature;
  /**
   * `limit_reached`: crediti del piano esauriti.
   * `not_in_plan`: funzionalità non inclusa nel piano corrente.
   */
  reason?: "limit_reached" | "not_in_plan";
  requiredPlan?: string;
  /**
   * Testo già pronto da mostrare al posto della copy generica.
   *
   * Serve per le postazioni: il piano a cui conviene salire dipende da
   * quante ne servono in più, ed è un conto che il server ha già fatto (la
   * stessa funzione che genera il 402) — ricalcolarlo qui vorrebbe dire
   * tenere due copie della stessa regola sincronizzate a mano.
   */
  detail?: string;
  onNavigateAway?: () => void;
}

/**
 * Paywall modale imposto da CLAUDE.md: nessuna icona di chiusura, nessun
 * click-outside, nessun Escape. L'unica uscita è la CTA di upgrade.
 */
export function UpgradeLimitModal({
  feature,
  reason = "limit_reached",
  requiredPlan,
  detail,
  onNavigateAway,
}: UpgradeLimitModalProps) {
  const router = useRouter();
  const ctaRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    ctaRef.current?.focus();
  }, []);

  function handleUpgrade() {
    onNavigateAway?.();
    // Direttamente alla scheda Piani & Fatturazione: chi arriva da un blocco
    // ha già deciso di guardare i piani, e atterrare sulla prima scheda lo
    // costringerebbe a cercarli fra branding, collaboratori e integrazioni.
    router.push("/settings?tab=billing");
  }

  const isLocked = reason === "not_in_plan";
  const Icon = isLocked ? Lock : AlertTriangle;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-xl border border-border bg-card p-6 text-center shadow-lg"
      >
        <div
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
            isLocked ? "bg-primary/10 text-primary" : "bg-status-blocked/10 text-status-blocked"
          }`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <h2 id="upgrade-modal-title" className="mt-4 text-lg font-semibold text-foreground">
          {isLocked ? "Funzione non disponibile" : "Limite Raggiunto"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {detail ??
            (isLocked ? (
              LOCKED_COPY[feature] ?? (
                <>
                  Il modulo {FEATURE_LABEL[feature]} è incluso esclusivamente nel piano{" "}
                  {requiredPlan ?? "Enterprise"}. Esegui l&apos;upgrade per sbloccarlo.
                </>
              )
            ) : (
              <>
                Hai esaurito i crediti di {FEATURE_LABEL[feature]} del tuo piano attuale. Esegui
                l&apos;upgrade per continuare a usare questa funzione.
              </>
            ))}
        </p>
        <button
          ref={ctaRef}
          type="button"
          onClick={handleUpgrade}
          className="mt-5 w-full rounded-xl bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110"
        >
          Passa a un piano superiore
        </button>
      </div>
    </div>
  );
}
