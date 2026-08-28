"use client";

import { useState } from "react";
import type { PropertyStatus } from "@prisma/client";
import { Loader2 } from "lucide-react";
import {
  PROPERTY_STATUS_HINTS,
  PROPERTY_STATUS_LABELS,
  PUBLISHED_STATUS,
} from "@/lib/listings/property-fields";
import { cn } from "@/lib/utils";

const ORDER: PropertyStatus[] = ["DRAFT", "ACTIVE", "RESERVED", "SOLD", "ARCHIVED"];

/** Verde solo per lo stato pubblicato: il colore deve dire "è online", non "va tutto bene". */
const DOT_CLASS: Record<PropertyStatus, string> = {
  DRAFT: "bg-status-pending",
  ACTIVE: "bg-status-qualified",
  RESERVED: "bg-status-pending",
  SOLD: "bg-muted-foreground",
  ARCHIVED: "bg-muted-foreground",
};

/**
 * Selettore di stato commerciale.
 *
 * È un `<select>` nativo e non un menu costruito a mano: si apre col pollice
 * su mobile, si naviga da tastiera e viene letto dagli screen reader senza che
 * dobbiamo reimplementare nulla.
 *
 * Sotto al selettore c'è sempre la conseguenza sui portali, perché è l'unica
 * parte che l'agente non può vedere da questa schermata: cambiare stato qui
 * fa comparire o sparire l'annuncio su Immobiliare.it alla rilettura
 * successiva del feed.
 */
export function PropertyStatusSelect({
  propertyId,
  status,
  onChange,
}: {
  propertyId: string;
  status: PropertyStatus;
  onChange: (next: PropertyStatus) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save(next: PropertyStatus) {
    const previous = status;
    // Aggiornamento ottimistico: il cambio di stato è un gesto che l'agente fa
    // di corsa fra una visita e l'altra, e un'attesa di rete su un menu a
    // tendina si nota. In caso di errore si torna indietro.
    onChange(next);
    setIsSaving(true);
    setError(false);

    try {
      const response = await fetch(`/api/properties/${propertyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) throw new Error();
    } catch {
      onChange(previous);
      setError(true);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn("h-2 w-2 shrink-0 rounded-full", DOT_CLASS[status])}
        />
        <label className="sr-only" htmlFor={`stato-${propertyId}`}>
          Stato dell&apos;immobile
        </label>
        <select
          id={`stato-${propertyId}`}
          value={status}
          disabled={isSaving}
          onChange={(event) => save(event.target.value as PropertyStatus)}
          className="h-11 rounded-lg border border-border-strong bg-background px-2 text-base text-foreground outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/40 disabled:opacity-60 sm:h-8 sm:text-xs"
        >
          {ORDER.map((value) => (
            <option key={value} value={value}>
              {PROPERTY_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
      </div>

      <p
        className={cn(
          "mt-1 text-xs",
          status === PUBLISHED_STATUS ? "text-status-qualified" : "text-muted-foreground"
        )}
      >
        {PROPERTY_STATUS_HINTS[status]}
      </p>

      {error ? (
        <p className="mt-1 text-xs text-status-blocked">
          Stato non salvato. Riprova.
        </p>
      ) : null}
    </div>
  );
}
