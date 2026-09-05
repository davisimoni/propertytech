"use client";

import { useEffect, useState } from "react";
import { Check, Clipboard, Gift, Loader2, Users } from "lucide-react";
import type { ReferralStatsResponse } from "@/app/api/referrals/route";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<ReferralStatsResponse["referrals"][number]["status"], string> = {
  PENDING: "In attesa del primo pagamento",
  ACTIVE: "Attivo",
  EXPIRED: "Terminato",
};

const STATUS_CLASSES: Record<ReferralStatsResponse["referrals"][number]["status"], string> = {
  PENDING: "bg-status-pending/10 text-status-pending",
  ACTIVE: "bg-status-qualified/10 text-status-qualified",
  EXPIRED: "bg-muted text-muted-foreground",
};

const DATE_FORMAT = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" });

/**
 * "Programma Referral" in /settings.
 *
 * Lo stato mostrato qui (`hasActiveDiscount`) è quello calcolato lato server
 * da `recomputeReferrerDiscount` — la stessa fonte di verità che aggiorna
 * davvero il coupon su Stripe, non una stima ricalcolata in pagina.
 */
export function ReferralPanel() {
  const [stats, setStats] = useState<ReferralStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/referrals")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ReferralStatsResponse | null) => setStats(data))
      .finally(() => setIsLoading(false));
  }, []);

  async function copyLink() {
    if (!stats) return;
    await navigator.clipboard.writeText(stats.referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Impossibile caricare il Programma Referral.
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Gift className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Programma Referral</h2>
          <p className="text-sm text-muted-foreground">
            Invita un&apos;agenzia: non appena attiva un piano a pagamento con il tuo link,
            ottieni il {stats.referrerDiscountPercent}% di sconto ricorrente per sempre sul tuo
            abbonamento. Lei riceve il {stats.refereeDiscountPercent}% di sconto di benvenuto sul
            suo primo abbonamento — un vantaggio per entrambe.
          </p>
        </div>
      </div>

      {/* --- Link di invito --- */}
      <div className="mt-4 rounded-lg border border-border p-4">
        <label htmlFor="referral-link" className="text-xs font-medium text-muted-foreground">
          Il tuo link di invito
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <code
            id="referral-link"
            className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-foreground"
          >
            {stats.referralLink}
          </code>
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 sm:h-9 text-xs font-medium text-foreground transition-all duration-200 hover:bg-muted"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-status-qualified" aria-hidden="true" />
            ) : (
              <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied ? "Copiato" : "Copia Link"}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Codice: <span className="font-medium text-foreground">{stats.referralCode}</span>
        </p>
      </div>

      {/* --- Contatori --- */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            Agenzie invitate
          </p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{stats.totalInvited}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Agenzie attive</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{stats.activeCount}</p>
        </div>
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs text-muted-foreground">Il tuo sconto</p>
          <p className="mt-1 text-2xl font-semibold text-primary">
            {stats.hasActiveDiscount ? `-${stats.referrerDiscountPercent}%` : "Non attivo"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {stats.hasActiveDiscount
              ? "Ricorrente per sempre sul tuo abbonamento."
              : "Si attiva alla prima agenzia invitata che attiva un piano a pagamento."}
          </p>
        </div>
      </div>

      {/* --- Elenco --- */}
      {stats.referrals.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Agenzie invitate
          </p>
          <ul className="mt-2 space-y-2">
            {stats.referrals.map((referral, index) => (
              <li
                key={index}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{referral.agencyName}</p>
                  <p className="text-xs text-muted-foreground">
                    Invitata il {DATE_FORMAT.format(new Date(referral.createdAt))}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                    STATUS_CLASSES[referral.status]
                  )}
                >
                  {STATUS_LABELS[referral.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
