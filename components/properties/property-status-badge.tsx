import type { PropertyStatus } from "@prisma/client";
import { PROPERTY_STATUS_LABELS } from "@/lib/listings/property-fields";
import { cn } from "@/lib/utils";

/**
 * Lo stato dell'immobile a colpo d'occhio.
 *
 * # Perché un badge e non il selettore
 *
 * Perché in elenco lo stato si LEGGE, non si cambia. Il selettore a tendina
 * occupa una riga intera per ogni immobile e invita a un'azione che nessuno
 * sta compiendo mentre scorre trenta schede: cambiarlo resta possibile
 * aprendo la scheda, dove c'è il contesto per farlo.
 *
 * # I colori dicono una cosa sola: è sui portali?
 *
 * Verde e ambra sono gli stati pubblicati (`PUBLISHED_STATUSES`), grigio
 * quelli che non lo sono. È la domanda che l'agente si pone davvero
 * scorrendo il portafoglio — "questo lo stanno vedendo?" — e un badge che
 * colorasse per simpatia invece che per quella distinzione sarebbe
 * decorazione.
 */
const STILI: Record<PropertyStatus, string> = {
  // Pubblicati: si vedono sui portali.
  ACTIVE: "bg-status-qualified/12 text-status-qualified border-status-qualified/30",
  RESERVED: "bg-status-pending/15 text-status-pending border-status-pending/30",
  // Non pubblicati: fuori dal feed.
  DRAFT: "bg-muted text-muted-foreground border-border",
  SOLD: "bg-primary/10 text-primary border-primary/25",
  ARCHIVED: "bg-muted text-muted-foreground border-border",
};

export function PropertyStatusBadge({
  status,
  className,
}: {
  status: PropertyStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-tight",
        STILI[status],
        className
      )}
    >
      {PROPERTY_STATUS_LABELS[status]}
    </span>
  );
}
