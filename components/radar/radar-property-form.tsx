"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { PROPERTY_TYPE_LABELS } from "@/lib/listings/property-fields";
import type { PropertyType } from "@prisma/client";
import type { RadarItem } from "./radar-board";

/**
 * Inserimento manuale di un'opportunità.
 *
 * I campi obbligatori sono i cinque che servono al matchmaking — comune,
 * tipologia, prezzo, metri quadri, e la zona che pesa sul punteggio — piu' il
 * tipo di opportunità. Tutto il resto è facoltativo: chiedere la data d'asta o
 * il numero di lotto per poter salvare fermerebbe l'agente che sta guardando
 * un annuncio incompleto, che è il caso normale.
 */
export function RadarPropertyForm({
  onCreated,
  onCancel,
}: {
  onCreated: (item: RadarItem) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<"ASTA" | "RIBASSO">("ASTA");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const numero = (name: string) => {
      const raw = value(name).replace(/[.\s]/g, "");
      return raw ? Number(raw) : null;
    };
    const data = value("auctionDate");

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/radar/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          comune: value("comune"),
          zona: value("zona"),
          type: value("type"),
          priceEur: numero("priceEur"),
          squareMeters: numero("squareMeters"),
          basePriceEur: numero("basePriceEur"),
          previousPriceEur: numero("previousPriceEur"),
          // Mezzogiorno locale: una data senza ora, convertita in UTC da un
          // fuso a est, scivolerebbe al giorno prima.
          auctionDate: data ? new Date(`${data}T12:00:00`).toISOString() : null,
          lotto: value("lotto"),
          sourceUrl: value("sourceUrl"),
          notes: value("notes"),
        }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message ?? `Salvataggio non riuscito (errore ${response.status}).`);
        return;
      }

      onCreated({ ...body.item, appraisal: null, _count: { matches: 0 } } as RadarItem);
    } catch {
      setError("Errore di rete. L'opportunità non è stata salvata.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card-surface space-y-4 p-4">
      <div className="inline-flex rounded-lg border border-border p-0.5">
        {(
          [
            ["ASTA", "Asta giudiziaria"],
            ["RIBASSO", "Ribasso di mercato"],
          ] as const
        ).map(([valore, etichetta]) => (
          <button
            key={valore}
            type="button"
            onClick={() => setKind(valore)}
            aria-pressed={kind === valore}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
              kind === valore ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {etichetta}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="comune" label="Comune" required>
          <input id="comune" name="comune" required maxLength={120} className="input-field w-full text-base sm:text-sm" />
        </Campo>

        <Campo id="zona" label="Zona o frazione" hint="facoltativo">
          <input id="zona" name="zona" maxLength={120} className="input-field w-full text-base sm:text-sm" />
        </Campo>

        <Campo id="type" label="Tipologia" required>
          <select id="type" name="type" required defaultValue="APPARTAMENTO" className="input-field w-full text-base sm:text-sm">
            {(Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]).map((t) => (
              <option key={t} value={t}>
                {PROPERTY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Campo>

        <Campo id="squareMeters" label="Metri quadri" required>
          <input id="squareMeters" name="squareMeters" required inputMode="numeric" className="input-field w-full text-base sm:text-sm" />
        </Campo>

        <Campo
          id="priceEur"
          label={kind === "ASTA" ? "Offerta minima (€)" : "Prezzo attuale (€)"}
          required
        >
          <input id="priceEur" name="priceEur" required inputMode="numeric" className="input-field w-full text-base sm:text-sm" />
        </Campo>

        {kind === "ASTA" ? (
          <Campo id="basePriceEur" label="Valore di perizia (€)" hint="lo ricava anche dalla perizia">
            <input id="basePriceEur" name="basePriceEur" inputMode="numeric" className="input-field w-full text-base sm:text-sm" />
          </Campo>
        ) : (
          <Campo id="previousPriceEur" label="Prezzo precedente (€)" hint="per calcolare il ribasso">
            <input id="previousPriceEur" name="previousPriceEur" inputMode="numeric" className="input-field w-full text-base sm:text-sm" />
          </Campo>
        )}

        {kind === "ASTA" && (
          <>
            <Campo id="auctionDate" label="Data dell'asta" hint="facoltativo">
              <input id="auctionDate" name="auctionDate" type="date" className="input-field w-full text-base sm:text-sm" />
            </Campo>
            <Campo id="lotto" label="Lotto" hint="facoltativo">
              <input id="lotto" name="lotto" maxLength={60} className="input-field w-full text-base sm:text-sm" />
            </Campo>
          </>
        )}

        <Campo id="sourceUrl" label="Link all'annuncio" hint="facoltativo">
          <input id="sourceUrl" name="sourceUrl" type="url" maxLength={500} className="input-field w-full text-base sm:text-sm" />
        </Campo>
      </div>

      <Campo id="notes" label="Note" hint="facoltativo">
        <textarea id="notes" name="notes" rows={2} maxLength={2000} className="input-field w-full resize-y text-base sm:text-sm" />
      </Campo>

      {error && (
        <p role="alert" className="text-sm text-status-blocked">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted"
        >
          Annulla
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-gradient px-3 text-xs font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 disabled:opacity-50"
        >
          {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Salva opportunità
        </button>
      </div>
    </form>
  );
}

function Campo({
  id,
  label,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
        {required && (
          <span className="text-status-blocked" aria-hidden="true">
            {" "}
            *
          </span>
        )}
        {hint && <span className="font-normal text-muted-foreground"> ({hint})</span>}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
