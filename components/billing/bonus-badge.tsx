import { Gift } from "lucide-react";
import { bonusDelPiano, bonusDisponibili } from "@/lib/bonuses";
import type { PlanId } from "@/lib/plans";

/**
 * Il bonus del piano, in cima all'elenco delle funzioni.
 *
 * # Perché in cima e non in fondo
 *
 * Perché è l'unica riga che gli altri listini non hanno: messa dopo i limiti
 * di utilizzo la legge chi era già convinto. Il badge nomina **solo** il bonus
 * che quel piano aggiunge, e una riga sotto dice che porta con sé quelli dei
 * piani inferiori: un badge che elenca tre nomi non si legge su un telefono.
 *
 * Componente senza stato e senza hook: lo usano sia il listino pubblico sia la
 * griglia dei piani in impostazioni, che sono uno server e l'altra client.
 */
export function BonusBadge({ planId }: { planId: PlanId }) {
  const bonus = bonusDelPiano(planId);
  if (!bonus) return null;

  const inclusi = bonusDisponibili(planId).length;

  return (
    <li className="mb-1 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
      <span className="flex items-start gap-2">
        <Gift className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-primary">
            Bonus incluso
          </span>
          <span className="block text-sm font-medium text-foreground">{bonus.name}</span>
          <span className="block text-xs text-muted-foreground">{bonus.tagline}</span>
          {inclusi > 1 && (
            <span className="mt-1 block text-xs text-muted-foreground">
              Più i {inclusi - 1} bonus dei piani precedenti.
            </span>
          )}
        </span>
      </span>
    </li>
  );
}
