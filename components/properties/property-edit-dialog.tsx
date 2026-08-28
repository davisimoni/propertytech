"use client";

import { useEffect, useState } from "react";
import type { ContractType, EnergyClass, PropertyType } from "@prisma/client";
import { Loader2, X } from "lucide-react";
import {
  CONTRACT_LABELS,
  ENERGY_CLASSES,
  PROPERTY_TYPE_LABELS,
} from "@/lib/listings/property-fields";

/** Campi modificabili della scheda. Le foto si gestiscono dalla loro sezione. */
export interface EditableProperty {
  id: string;
  reference: string;
  title: string;
  contract: ContractType;
  type: PropertyType;
  comune: string;
  provincia: string | null;
  zona: string | null;
  indirizzo: string | null;
  priceEur: number;
  squareMeters: number;
  rooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  energyClass: EnergyClass | null;
  description: string | null;
}

/** Numero dal campo, o `undefined` se lasciato vuoto. */
function toNumber(value: string): number | undefined {
  const clean = value.trim();
  if (!clean) return undefined;
  const parsed = Number.parseInt(clean, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Testo, o `undefined` se vuoto: i campi facoltativi tornano a `null` sul server. */
function toText(value: string): string | undefined {
  return value.trim() || undefined;
}

const MESSAGGI: Record<string, string> = {
  reference_taken: "Esiste già un immobile con questo riferimento.",
  not_found: "Immobile non trovato.",
  unauthorized: "Sessione scaduta. Ricarica la pagina.",
};

/**
 * Modifica della scheda immobile.
 *
 * Il prezzo è il campo che si corregge più spesso — un ribasso concordato al
 * telefono va online lo stesso giorno — ed è il motivo per cui questa finestra
 * esiste: finora l'unico modo di cambiarlo era rigenerare l'annuncio dal
 * Modulo 3, cioè rifare un lavoro per correggere un numero.
 */
export function PropertyEditDialog({
  property,
  onClose,
  onSaved,
}: {
  property: EditableProperty;
  onClose: () => void;
  onSaved: (updated: EditableProperty) => void;
}) {
  const [form, setForm] = useState({
    reference: property.reference,
    title: property.title,
    contract: property.contract,
    type: property.type,
    comune: property.comune,
    provincia: property.provincia ?? "",
    zona: property.zona ?? "",
    indirizzo: property.indirizzo ?? "",
    priceEur: String(property.priceEur),
    squareMeters: String(property.squareMeters),
    rooms: property.rooms === null ? "" : String(property.rooms),
    bathrooms: property.bathrooms === null ? "" : String(property.bathrooms),
    floor: property.floor ?? "",
    energyClass: property.energyClass ?? "",
    description: property.description ?? "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, isSaving]);

  function set(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/properties/${property.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: form.reference.trim(),
          title: form.title.trim(),
          contract: form.contract,
          type: form.type,
          comune: form.comune.trim(),
          provincia: toText(form.provincia),
          zona: toText(form.zona),
          indirizzo: toText(form.indirizzo),
          priceEur: toNumber(form.priceEur),
          squareMeters: toNumber(form.squareMeters),
          rooms: toNumber(form.rooms),
          bathrooms: toNumber(form.bathrooms),
          floor: toText(form.floor),
          energyClass: toText(form.energyClass),
          description: toText(form.description),
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { property?: EditableProperty; error?: string; issues?: string[] }
        | null;

      if (!response.ok) {
        // I messaggi di validazione arrivano dallo schema condiviso col
        // server: ripeterli qui a mano li farebbe divergere alla prima
        // modifica di una regola.
        setError(
          data?.issues?.[0] ??
            MESSAGGI[data?.error ?? ""] ??
            "Salvataggio non riuscito. Controlla i campi e riprova."
        );
        return;
      }

      if (data?.property) onSaved(data.property);
      onClose();
    } catch {
      setError("Salvataggio non riuscito. Riprova.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="fixed inset-0 bg-black/50" onClick={isSaving ? undefined : onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modifica-immobile"
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-xl border border-border bg-card shadow-xl sm:rounded-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h2 id="modifica-immobile" className="text-sm font-semibold text-foreground">
              Modifica scheda immobile
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Rif. {property.reference}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Chiudi"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-all duration-200 hover:bg-muted disabled:opacity-50 sm:h-8 sm:w-8"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="ed-title" className="text-xs font-medium text-foreground">
                Titolo dell&apos;annuncio
              </label>
              <input
                id="ed-title"
                className="input-field mt-1"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-ref" className="text-xs font-medium text-foreground">
                Riferimento
              </label>
              <input
                id="ed-ref"
                className="input-field mt-1"
                value={form.reference}
                onChange={(e) => set("reference", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-price" className="text-xs font-medium text-foreground">
                Prezzo (€)
              </label>
              <input
                id="ed-price"
                inputMode="numeric"
                className="input-field mt-1"
                value={form.priceEur}
                onChange={(e) => set("priceEur", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-contract" className="text-xs font-medium text-foreground">
                Contratto
              </label>
              <select
                id="ed-contract"
                className="input-field mt-1"
                value={form.contract}
                onChange={(e) => set("contract", e.target.value)}
              >
                {Object.entries(CONTRACT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ed-type" className="text-xs font-medium text-foreground">
                Tipologia
              </label>
              <select
                id="ed-type"
                className="input-field mt-1"
                value={form.type}
                onChange={(e) => set("type", e.target.value)}
              >
                {Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ed-comune" className="text-xs font-medium text-foreground">
                Comune
              </label>
              <input
                id="ed-comune"
                className="input-field mt-1"
                value={form.comune}
                onChange={(e) => set("comune", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-prov" className="text-xs font-medium text-foreground">
                Provincia
              </label>
              <input
                id="ed-prov"
                className="input-field mt-1"
                placeholder="MO"
                value={form.provincia}
                onChange={(e) => set("provincia", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-zona" className="text-xs font-medium text-foreground">
                Zona
              </label>
              <input
                id="ed-zona"
                className="input-field mt-1"
                value={form.zona}
                onChange={(e) => set("zona", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-indirizzo" className="text-xs font-medium text-foreground">
                Indirizzo
              </label>
              <input
                id="ed-indirizzo"
                className="input-field mt-1"
                value={form.indirizzo}
                onChange={(e) => set("indirizzo", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-mq" className="text-xs font-medium text-foreground">
                Superficie (mq)
              </label>
              <input
                id="ed-mq"
                inputMode="numeric"
                className="input-field mt-1"
                value={form.squareMeters}
                onChange={(e) => set("squareMeters", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-rooms" className="text-xs font-medium text-foreground">
                Locali
              </label>
              <input
                id="ed-rooms"
                inputMode="numeric"
                className="input-field mt-1"
                value={form.rooms}
                onChange={(e) => set("rooms", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-bagni" className="text-xs font-medium text-foreground">
                Bagni
              </label>
              <input
                id="ed-bagni"
                inputMode="numeric"
                className="input-field mt-1"
                value={form.bathrooms}
                onChange={(e) => set("bathrooms", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-piano" className="text-xs font-medium text-foreground">
                Piano
              </label>
              <input
                id="ed-piano"
                className="input-field mt-1"
                value={form.floor}
                onChange={(e) => set("floor", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ed-classe" className="text-xs font-medium text-foreground">
                Classe energetica
              </label>
              <select
                id="ed-classe"
                className="input-field mt-1"
                value={form.energyClass}
                onChange={(e) => set("energyClass", e.target.value)}
              >
                <option value="">Non indicata</option>
                {ENERGY_CLASSES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="ed-desc" className="text-xs font-medium text-foreground">
                Descrizione
              </label>
              <textarea
                id="ed-desc"
                rows={8}
                className="input-field mt-1 resize-y"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                È il testo che finisce nel feed verso i portali.
              </p>
            </div>
          </div>

          {error ? <p className="mt-3 text-xs text-status-blocked">{error}</p> : null}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-border p-4">
          <button type="button" onClick={onClose} disabled={isSaving} className="btn-outline text-xs disabled:opacity-50">
            Annulla
          </button>
          <button type="button" onClick={save} disabled={isSaving} className="btn-brand text-xs disabled:opacity-50">
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Salva modifiche
          </button>
        </footer>
      </div>
    </div>
  );
}
