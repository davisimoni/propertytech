"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Building2, Check, Loader2, X } from "lucide-react";
import { BRAND } from "@/lib/brand";

/**
 * Banner di completamento profilo per gli account creati via Google, dove il
 * nome dell'agenzia è stato dedotto dal nome personale.
 *
 * Non è bloccante — la dashboard resta usabile — ma è in evidenza: quel nome
 * finisce nei report ai proprietari e nei messaggi WhatsApp automatici.
 */
export function AgencyNamePrompt({ initialName }: { initialName: string }) {
  const { update } = useSession();
  const [agencyName, setAgencyName] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    const trimmed = agencyName.trim();
    if (trimmed.length < 2) {
      setError("Inserisci il nome della tua agenzia.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/user/update-agency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyName: trimmed }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "Salvataggio non riuscito. Riprova.");
        return;
      }

      setSaved(true);
      // Allinea il nome mostrato nell'header senza richiedere un nuovo login:
      // il JWT porta ancora il valore precedente.
      await update();
    } catch {
      setError("Errore di rete durante il salvataggio.");
    } finally {
      setIsSaving(false);
    }
  }

  if (dismissed || saved) return null;

  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
      {/* Niente `flex-wrap`: su schermo stretto mandava a capo la X, che sulla
          riga nuova finiva a SINISTRA — `justify-between` con un solo elemento
          lo allinea all'inizio. Il blocco di testo ha già `min-w-0` e si
          restringe da solo, quindi il pulsante resta dove ci si aspetta: in
          alto a destra. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-gradient text-white shadow-sm">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Benvenuto in {BRAND.name}!</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Inserisci il nome della tua Agenzia Immobiliare per personalizzare i report e i
              messaggi automatizzati.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Chiudi, lo farò più tardi"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground sm:h-8 sm:w-8 transition-all duration-200 hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="agency-name-prompt" className="sr-only">
          Nome della tua agenzia immobiliare
        </label>
        <input
          id="agency-name-prompt"
          type="text"
          value={agencyName}
          onChange={(event) => setAgencyName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
          }}
          placeholder="Es. Immobiliare Rossi S.r.l."
          className="input-field flex-1"
        />
        <button
          type="button"
          onClick={save}
          disabled={isSaving}
          className="btn-brand shrink-0"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Salva
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-status-blocked">
          {error}
        </p>
      )}
    </section>
  );
}
