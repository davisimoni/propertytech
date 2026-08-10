"use client";

import { useState } from "react";
import type { PropertyType } from "@prisma/client";
import { Check, Loader2, Save, SlidersHorizontal } from "lucide-react";
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS } from "@/lib/listings/property-fields";
import type { LeadView } from "@/lib/whatsapp/view-types";

/**
 * Preferenze di ricerca del contatto: ciò che alimenta lo Smart Matching.
 *
 * Sta nella scheda lead e non in un modulo a parte perché è informazione che
 * l'agente raccoglie parlando al telefono, spesso mentre guarda la
 * conversazione. Un lead senza preferenze non partecipa al matching: è una
 * scelta deliberata, meglio nessun suggerimento che suggerimenti casuali.
 */
export function LeadPreferencesCard({ lead }: { lead: LeadView }) {
  const [zone, setZone] = useState(lead.preferredZone ?? "");
  const [type, setType] = useState<PropertyType | "">(lead.preferredType ?? "");
  const [budgetMin, setBudgetMin] = useState(
    lead.budgetMin === null ? "" : String(lead.budgetMin)
  );
  const [budgetMax, setBudgetMax] = useState(
    lead.budgetMax === null ? "" : String(lead.budgetMax)
  );
  const [minMq, setMinMq] = useState(
    lead.minSquareMeters === null ? "" : String(lead.minSquareMeters)
  );

  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Campo vuoto = criterio non dichiarato, quindi `null` e non `0`. */
  function toNullableInt(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function save() {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/whatsapp/leads/${lead.id}/preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredZone: zone.trim() || null,
          preferredType: type || null,
          budgetMin: toNullableInt(budgetMin),
          budgetMax: toNullableInt(budgetMax),
          minSquareMeters: toNullableInt(minMq),
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "Salvataggio non riuscito.");
        return;
      }

      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    } catch {
      setError("Errore di rete durante il salvataggio.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Preferenze di ricerca
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Alimentano i Match Perfetti con gli immobili in portafoglio. Lascia vuoto ciò che il
        cliente non ha dichiarato.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor={`pref-zone-${lead.id}`} className="text-[11px] text-muted-foreground">
            Zona desiderata
          </label>
          <input
            id={`pref-zone-${lead.id}`}
            type="text"
            value={zone}
            onChange={(event) => setZone(event.target.value)}
            placeholder="Navigli"
            className="input-field mt-0.5 text-sm"
          />
        </div>

        <div>
          <label htmlFor={`pref-type-${lead.id}`} className="text-[11px] text-muted-foreground">
            Tipologia
          </label>
          <select
            id={`pref-type-${lead.id}`}
            value={type}
            onChange={(event) => setType(event.target.value as PropertyType | "")}
            className="input-field mt-0.5 text-sm"
          >
            <option value="">Non dichiarata</option>
            {PROPERTY_TYPES.map((option) => (
              <option key={option} value={option}>
                {PROPERTY_TYPE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`pref-bmin-${lead.id}`} className="text-[11px] text-muted-foreground">
            Budget minimo €
          </label>
          <input
            id={`pref-bmin-${lead.id}`}
            type="number"
            inputMode="numeric"
            min={0}
            value={budgetMin}
            onChange={(event) => setBudgetMin(event.target.value)}
            placeholder="—"
            className="input-field mt-0.5 text-sm"
          />
        </div>

        <div>
          <label htmlFor={`pref-bmax-${lead.id}`} className="text-[11px] text-muted-foreground">
            Budget massimo €
          </label>
          <input
            id={`pref-bmax-${lead.id}`}
            type="number"
            inputMode="numeric"
            min={0}
            value={budgetMax}
            onChange={(event) => setBudgetMax(event.target.value)}
            placeholder="250000"
            className="input-field mt-0.5 text-sm"
          />
        </div>

        <div>
          <label htmlFor={`pref-mq-${lead.id}`} className="text-[11px] text-muted-foreground">
            Superficie minima mq
          </label>
          <input
            id={`pref-mq-${lead.id}`}
            type="number"
            inputMode="numeric"
            min={0}
            value={minMq}
            onChange={(event) => setMinMq(event.target.value)}
            placeholder="—"
            className="input-field mt-0.5 text-sm"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={isSaving}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted disabled:opacity-50"
      >
        {isSaving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : savedAt ? (
          <Check className="h-3.5 w-3.5 text-status-qualified" />
        ) : (
          <Save className="h-3.5 w-3.5" />
        )}
        {savedAt ? "Salvate" : "Salva preferenze"}
      </button>

      {error && (
        <p role="alert" className="mt-2 text-xs text-status-blocked">
          {error}
        </p>
      )}
    </section>
  );
}
