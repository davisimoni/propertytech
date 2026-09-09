"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Interruttore on/off a forma di pillola.
 *
 * # Perché un componente suo, e non lo stile bottone già in uso altrove
 *
 * Perché altrove in questo progetto un "toggle" è un bottone che cambia
 * colore, bordo e icona (vedi `AiHandoverToggle`, il campo Chiavi nella
 * scheda immobile): funziona bene quando il testo accanto spiega già lo
 * stato per esteso. Qui invece servono due interruttori piccoli, uno per
 * card, affiancati a un'etichetta breve ("Pubblicazione automatica"): la
 * forma a pillola si legge a colpo d'occhio come acceso/spento senza dover
 * interpretare un colore di sfondo.
 *
 * # Perché 44px anche sul desktop, e non solo su schermo tattile
 *
 * Perché è un controllo isolato dentro una card, non una fila densa di
 * pulsanti dove la compattezza è un pregio (quel caso — barre di azioni,
 * elenchi di filtri — usa altrove `pointer: coarse` per restringersi sui
 * dispositivi non tattili). Qui lo spazio non è conteso, e una dimensione
 * sola evita di dover ricalcolare a mano la posizione del pomello per due
 * misure diverse: un conto sbagliato sposterebbe il pomello fuori dalla
 * pillola invece che restarci dentro.
 */
export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  isSaving = false,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  isSaving?: boolean;
  /** Per lo screen reader: il testo visibile accanto è nel genitore, non qui dentro. */
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || isSaving}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-11 w-20 shrink-0 items-center rounded-full border transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-status-qualified bg-status-qualified" : "border-border-strong bg-muted"
      )}
    >
      <span
        className={cn(
          "absolute left-1 top-1/2 flex h-9 w-9 -translate-y-1/2 translate-x-0 items-center justify-center rounded-full bg-white shadow transition-transform duration-200",
          checked && "translate-x-9"
        )}
      >
        {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </span>
    </button>
  );
}
