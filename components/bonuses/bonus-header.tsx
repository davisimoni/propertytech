import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Bonus } from "@/lib/bonuses";

/** Intestazione comune alle pagine dei bonus: titolo, cosa risolve, ritorno. */
export function BonusHeader({ bonus }: { bonus: Bonus }) {
  return (
    <div className="space-y-3">
      <Link
        href="/bonuses"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Tutti i bonus
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-foreground">{bonus.name}</h1>
        <p className="text-sm text-muted-foreground">{bonus.tagline}</p>
      </div>
    </div>
  );
}
