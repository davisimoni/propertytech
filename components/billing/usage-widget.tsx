"use client";

import { useState } from "react";
import { AlertTriangle, MessageSquarePlus, Receipt } from "lucide-react";
import { useUsageStats } from "@/hooks/use-usage-stats";
import { canRechargeCredits, formatCount, formatEurCents } from "@/lib/plans";
import { cn } from "@/lib/utils";
import type { UsageMetric, WhatsAppOverage } from "@/lib/usage-types";
import { RechargeCreditsDialog } from "@/components/billing/recharge-credits-dialog";

/**
 * Da quale consumo in su si propone la ricarica.
 *
 * Non solo a limite raggiunto: a quel punto l'assistente ha già smesso di
 * rispondere ai nuovi contatti, e i lead persi nel frattempo non tornano.
 * All'80% c'è ancora margine per comprare prima che si fermi.
 */
const SOGLIA_AVVISO = 0.8;

function quasiEsaurito(metric: UsageMetric): boolean {
  if (metric.limit === null) return false;
  return metric.isLimitReached || metric.used / metric.limit >= SOGLIA_AVVISO;
}

/** Come nel listino: "1.500" e non "1500", stessa cifra scritta allo stesso modo ovunque compaia. */
function formatLimit(limit: number | null): string {
  return limit === null ? "∞" : formatCount(limit);
}

function LimitBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-status-blocked/10 px-2 py-0.5 text-xs font-semibold text-status-blocked">
      <AlertTriangle className="h-3 w-3" />
      Limiti Raggiunti
    </span>
  );
}

function UsageBar({ label, metric }: { label: string; metric: UsageMetric }) {
  const percent = metric.limit === null ? 0 : Math.min((metric.used / metric.limit) * 100, 100);

  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={cn(
            "font-medium",
            metric.isLimitReached ? "text-status-blocked" : "text-foreground"
          )}
        >
          {formatCount(metric.used)}/{formatLimit(metric.limit)} usati
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            metric.isLimitReached ? "bg-status-blocked" : "bg-brand-gradient"
          )}
          style={{ width: metric.limit === null ? "100%" : `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Consumo a pagamento dell'Enterprise, sotto la barra WhatsApp.
 *
 * Compare solo quando dice qualcosa: con conversazioni già oltre l'incluso
 * (quante, e quanto circa in fattura) o in vista della soglia (cosa succede
 * dopo). Prima dell'80% una riga sul prezzo extra sarebbe rumore su un
 * pannello che l'agente guarda ogni giorno.
 *
 * "Circa" e non un importo secco: la fattura la emette Stripe al rinnovo, e
 * questa è la nostra stima dal contatore, non il documento.
 */
function OverageNote({ overage, metric }: { overage: WhatsAppOverage; metric: UsageMetric }) {
  if (!overage.active) return null;

  const prezzo = formatEurCents(overage.unitPriceEur);

  if (overage.extraConversations > 0) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-foreground">
        <Receipt className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>
          <strong className="font-semibold">{formatCount(overage.extraConversations)}</strong>{" "}
          {overage.extraConversations === 1 ? "conversazione" : "conversazioni"} oltre l&apos;incluso
          · circa {formatEurCents(overage.estimatedEur)} nella prossima fattura ({prezzo} l&apos;una)
        </span>
      </p>
    );
  }

  if (!quasiEsaurito(metric) || metric.limit === null) return null;

  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <Receipt className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        Oltre le {formatCount(metric.limit)} incluse l&apos;assistente continua: {prezzo} a
        conversazione.
      </span>
    </p>
  );
}

interface UsageWidgetProps {
  variant?: "full" | "compact";
  /**
   * Se mostrare l'acquisto di crediti. Acquistare impegna l'agenzia, quindi
   * vale la regola delle altre rotte di pagamento: solo il titolare. Il
   * pulsante non compare a un collaboratore invece di comparire e rispondere
   * 403 — nascondere non autorizza, ma mostrare un comando che non funziona
   * è un difetto in più, non uno in meno.
   */
  canPurchase?: boolean;
}

export function UsageWidget({ variant = "full", canPurchase = false }: UsageWidgetProps) {
  const { data, isLoading } = useUsageStats();
  const [ricaricaAperta, setRicaricaAperta] = useState(false);

  if (isLoading || !data) {
    return <div className={cn("animate-pulse rounded-xl bg-muted", variant === "compact" ? "h-5 w-40" : "h-24")} />;
  }

  if (variant === "compact") {
    return (
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {/* `truncate` e `whitespace-nowrap`: in un header alto 56px una
            scritta che va a capo esce dal contenitore invece di adattarsi. */}
        <span className="truncate whitespace-nowrap font-medium text-foreground">
          Piano {data.planName}
        </span>
        {data.hasAnyLimitReached ? (
          <LimitBadge />
        ) : (
          <span className="hidden text-muted-foreground sm:inline">
            — {formatCount(data.whatsapp.used)}/{formatLimit(data.whatsapp.limit)} conversazioni WA
            usate
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="card-surface space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Crediti Piano {data.planName}
        </span>
        {data.hasAnyLimitReached && <LimitBadge />}
      </div>
      <UsageBar label="Crediti WhatsApp" metric={data.whatsapp} />
      {data.whatsappOverage && <OverageNote overage={data.whatsappOverage} metric={data.whatsapp} />}
      <UsageBar label="Crediti Documenti" metric={data.documents} />
      {data.voice.limit !== 0 && <UsageBar label="Note Vocali" metric={data.voice} />}

      {/* La ricarica riguarda le sole conversazioni WhatsApp: documenti e note
          vocali non hanno un pacchetto da comprare, e mostrare qui un pulsante
          generico farebbe credere il contrario.

          Solo Starter e Professional (`canRechargeCredits`): l'Enterprise
          oltre l'incluso prosegue a consumo, e un pacchetto prepagato gli
          farebbe pagare prima ciò che altrimenti paga solo se lo usa. */}
      {canPurchase && canRechargeCredits(data.planId) && quasiEsaurito(data.whatsapp) && (
        <button
          type="button"
          onClick={() => setRicaricaAperta(true)}
          className="btn-outline w-full text-xs"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
          Acquista crediti extra
        </button>
      )}

      {ricaricaAperta && (
        <RechargeCreditsDialog
          restanti={
            data.whatsapp.limit === null
              ? null
              : Math.max(0, data.whatsapp.limit - data.whatsapp.used)
          }
          onClose={() => setRicaricaAperta(false)}
        />
      )}
    </div>
  );
}
