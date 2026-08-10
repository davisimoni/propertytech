"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Phone, Sparkles } from "lucide-react";
import { formatPrice } from "@/lib/listings/property-fields";
import { PERFECT_MATCH_THRESHOLD, matchLabel } from "@/lib/matching/smart-match";
import { cn } from "@/lib/utils";

interface DashboardMatch {
  id: string;
  score: number;
  reasons: string[];
  clientName: string;
  clientPhone: string;
  propertyReference: string;
  propertyTitle: string;
  comune: string;
  priceEur: number;
}

/**
 * "Match Perfetti" in dashboard: gli accoppiamenti immobile ↔ lead con il
 * punteggio più alto, cioè le telefonate che conviene fare per prime oggi.
 *
 * Il riquadro scompare quando non c'è nulla da mostrare, invece di occupare
 * spazio con un vuoto: una dashboard piena di sezioni inerti smette di essere
 * letta.
 */
export function SmartMatches() {
  const [matches, setMatches] = useState<DashboardMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/properties/matches")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { matches: DashboardMatch[] } | null) => {
        if (data) setMatches(data.matches);
      })
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <section className="flex items-center justify-center rounded-xl border border-border bg-card p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  if (matches.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          Match Perfetti
        </h2>
        <Link
          href="/properties"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Portafoglio immobili
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        Lead qualificati le cui preferenze corrispondono a un immobile in portafoglio.
      </p>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {matches.map((match) => (
          <li
            key={match.id}
            className={cn(
              "rounded-lg border p-3",
              match.score >= PERFECT_MATCH_THRESHOLD
                ? "border-status-qualified/40 bg-status-qualified/5"
                : "border-border"
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{match.clientName}</p>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  match.score >= PERFECT_MATCH_THRESHOLD
                    ? "bg-status-qualified/15 text-status-qualified"
                    : "bg-primary/10 text-primary"
                )}
              >
                {matchLabel(match.score)} · {match.score}%
              </span>
            </div>

            <p className="mt-1 truncate text-xs text-muted-foreground">
              Rif. {match.propertyReference} — {match.propertyTitle}
            </p>
            <p className="text-xs text-muted-foreground">
              {match.comune} · {formatPrice(match.priceEur)}
            </p>

            <a
              href={`tel:${match.clientPhone}`}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <Phone className="h-3.5 w-3.5" />
              {match.clientPhone}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
