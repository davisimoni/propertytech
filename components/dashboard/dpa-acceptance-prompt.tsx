"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { DPA_SUMMARY_POINTS, DPA_VERSION } from "@/lib/compliance";

/**
 * Richiesta di accettazione del DPA per gli account creati via Google, che non
 * incontrano la casella presente nel form di registrazione.
 *
 * Volutamente non ignorabile: a differenza del completamento del nome agenzia,
 * qui manca un adempimento contrattuale, e permettere di rimandarlo
 * lascerebbe l'agenzia a usare il servizio senza un accordo ex art. 28 GDPR.
 */
export function DpaAcceptancePrompt() {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/user/accept-dpa", { method: "POST" });

      if (!response.ok) {
        setError("Salvataggio non riuscito. Riprova.");
        return;
      }

      // Ricarica i dati server-side: il prompt sparisce solo dopo che
      // l'accettazione è effettivamente registrata.
      router.refresh();
    } catch {
      setError("Errore di rete durante il salvataggio.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-gradient text-white shadow-sm">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Un passaggio prima di iniziare: l&apos;accordo sul trattamento dei dati
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tratteremo dati di tuoi clienti e di terzi per tuo conto. La normativa richiede un
            accordo fra noi, in cui ti impegniamo a:
          </p>

          <ul className="mt-3 space-y-1.5">
            {DPA_SUMMARY_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2 text-sm text-foreground">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                />
                {point}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={accept} disabled={isSaving} className="btn-brand">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Accetto l&apos;accordo
            </button>
            <Link
              href="/dpa"
              target="_blank"
              className="text-sm font-medium text-primary hover:underline"
            >
              Leggi il testo completo (v{DPA_VERSION})
            </Link>
          </div>

          {error && (
            <p role="alert" className="mt-2 text-sm text-status-blocked">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
