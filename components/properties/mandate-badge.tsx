"use client";

import { FileSignature, KeyRound, TriangleAlert } from "lucide-react";
import type { ListingType } from "@prisma/client";
import {
  daysUntilExpiry,
  formatCommission,
  LISTING_TYPE_LABELS,
  mandateStatus,
} from "@/lib/listings/mandate";
import { cn } from "@/lib/utils";

/**
 * Stato dell'incarico nella scheda immobile.
 *
 * # Perché l'avviso è a colori e non una data
 *
 * Una data di scadenza da sola richiede che l'agente la confronti a mente con
 * oggi, per ogni scheda. Il colore fa il conto al posto suo, ed è ciò che
 * permette di scorrere un portafoglio di quaranta immobili e vedere subito
 * quali chiedono attenzione.
 *
 * Rosso non è un'esagerazione: un incarico scaduto significa che quell'immobile
 * **è già uscito dal feed verso i portali** e non si può pubblicizzare.
 */
export function MandateBadge({
  listingType,
  mandateExpiration,
  commissionRate,
  keysInOffice,
  keysLocation,
}: {
  listingType: ListingType | null;
  mandateExpiration: string | null;
  commissionRate: number | null;
  keysInOffice: boolean;
  keysLocation: string | null;
}) {
  const scadenza = mandateExpiration ? new Date(mandateExpiration) : null;
  const stato = mandateStatus(scadenza);
  const giorni = scadenza ? daysUntilExpiry(scadenza) : null;
  const provvigione = formatCommission(commissionRate);

  // Niente incarico, niente provvigione, niente chiavi: non c'è nulla da dire
  // e una riga vuota è peggio di una riga assente.
  if (!listingType && stato === "nessuno" && !provvigione && !keysInOffice) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {listingType ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          <FileSignature className="h-3.5 w-3.5" />
          {LISTING_TYPE_LABELS[listingType]}
        </span>
      ) : null}

      {stato === "scaduto" && giorni !== null ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-status-blocked/10 px-2.5 py-1 text-xs font-semibold text-status-blocked">
          <TriangleAlert className="h-3.5 w-3.5" />
          Incarico scaduto · fuori dai portali
        </span>
      ) : null}

      {stato === "in_scadenza" && giorni !== null ? (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            // Entro 30 giorni è il momento di parlare di rinnovo; fra 30 e 60
            // è un promemoria. Due toni perché l'urgenza è diversa.
            giorni <= 30
              ? "bg-status-pending/15 text-status-pending"
              : "bg-muted text-muted-foreground"
          )}
        >
          <TriangleAlert className="h-3.5 w-3.5" />
          {giorni === 0
            ? "Incarico in scadenza oggi"
            : giorni === 1
              ? "Incarico: 1 giorno"
              : `Incarico: ${giorni} giorni`}
        </span>
      ) : null}

      {provvigione ? (
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Provvigione {provvigione}
        </span>
      ) : null}

      {keysInOffice ? (
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-status-qualified/10 px-2.5 py-1 text-xs font-medium text-status-qualified"
          title={keysLocation ?? undefined}
        >
          <KeyRound className="h-3.5 w-3.5" />
          Chiavi in agenzia{keysLocation ? ` · ${keysLocation}` : ""}
        </span>
      ) : null}
    </div>
  );
}
