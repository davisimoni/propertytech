"use client";

import { useEffect, useState } from "react";
import {
  BellRing,
  Download,
  Loader2,
  Plug,
} from "lucide-react";
import { SELLER_CATEGORY_LABELS } from "@/lib/whatsapp/portfolio";
import { CrmConnector } from "@/components/settings/crm-connector";
import type { CrmProviderId, LeadFieldKey } from "@/lib/integrations/providers";
import { cn } from "@/lib/utils";

interface IntegrationView {
  crmWebhookUrl: string | null;
  crmWebhookSecret: string | null;
  crmProvider: CrmProviderId;
  crmAuthTokenMask: string | null;
  crmAuthUser: string | null;
  crmFieldMap: Record<LeadFieldKey, string>;
  reminderEnabled: boolean;
  reminderHoursBefore: number;
}

const REMINDER_OPTIONS = [
  { value: 2, label: "2 ore prima" },
  { value: 6, label: "6 ore prima" },
  { value: 24, label: "24 ore prima" },
  { value: 48, label: "48 ore prima" },
];

const CATEGORY_OPTIONS = Object.entries(SELLER_CATEGORY_LABELS);

/**
 * "Integrazione Gestionale / Webhook" in /settings.
 *
 * Raccoglie le tre leve che tolgono l'agenzia dal doppio inserimento manuale:
 * export CSV, inoltro automatico al gestionale e promemoria anti no-show.
 */
export function IntegrationPanel() {
  const [config, setConfig] = useState<IntegrationView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [onlyQualified, setOnlyQualified] = useState(false);

  useEffect(() => {
    fetch("/api/user/integration")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: IntegrationView | null) => {
        if (data) {
          setConfig(data);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function save(patch: Partial<IntegrationView>) {
    setIsSaving(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/user/integration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      const data = await response.json();

      if (!response.ok) {
        setFeedback({ tone: "error", text: data.message ?? "Salvataggio non riuscito." });
        return;
      }

      setConfig(data as IntegrationView);
      setFeedback({ tone: "ok", text: "Impostazioni salvate." });
    } catch {
      setFeedback({ tone: "error", text: "Errore di rete durante il salvataggio." });
    } finally {
      setIsSaving(false);
    }
  }

  function exportHref(): string {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (category) params.set("category", category);
    if (onlyQualified) params.set("status", "QUALIFIED");

    const query = params.toString();
    return `/api/leads/export${query ? `?${query}` : ""}`;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Plug className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Integrazione Gestionale / Webhook</h2>
          <p className="text-sm text-muted-foreground">
            Porta i lead qualificati nel gestionale che usi già, senza reinserirli a mano.
          </p>
        </div>
      </div>

      {/* --- Export CSV --- */}
      <div className="mt-5 rounded-lg border border-border p-4">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Download className="h-3.5 w-3.5" />
          Esporta lead in CSV / Excel
        </h3>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="export-from" className="text-xs text-muted-foreground">
              Dal
            </label>
            <input
              id="export-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="input-field mt-1"
            />
          </div>
          <div>
            <label htmlFor="export-to" className="text-xs text-muted-foreground">
              Al
            </label>
            <input
              id="export-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="input-field mt-1"
            />
          </div>
          <div>
            <label htmlFor="export-category" className="text-xs text-muted-foreground">
              Categoria venditore
            </label>
            <select
              id="export-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="input-field mt-1"
            >
              <option value="">Tutte le categorie</option>
              {CATEGORY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-2.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={onlyQualified}
                onChange={(event) => setOnlyQualified(event.target.checked)}
                className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
              />
              Solo qualificati
            </label>
          </div>
        </div>

        <a href={exportHref()} download className="btn-brand mt-3 w-full sm:w-auto">
          <Download className="h-4 w-4" />
          Scarica CSV
        </a>
      </div>

      {/* --- Collegamento al gestionale --- */}
      {config && (
        <CrmConnector
          state={config}
          onSaved={(next) => {
            setConfig({ ...config, ...next });
          }}
        />
      )}

      {/* --- Promemoria anti no-show --- */}
      <div className="mt-4 rounded-lg border border-border p-4">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <BellRing className="h-3.5 w-3.5" />
          Promemoria anti no-show
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Messaggio WhatsApp automatico prima della visita. Se il cliente risponde NO, lo slot
          torna libero in agenda e l&apos;appuntamento risulta disdetto nella scheda lead.
        </p>

        <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={config?.reminderEnabled ?? true}
            onChange={(event) => save({ reminderEnabled: event.target.checked })}
            disabled={isSaving}
            className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
          />
          Invia il promemoria automatico
        </label>

        <div className="mt-3">
          <label htmlFor="reminder-hours" className="text-xs text-muted-foreground">
            Anticipo
          </label>
          <select
            id="reminder-hours"
            value={config?.reminderHoursBefore ?? 24}
            onChange={(event) => save({ reminderHoursBefore: Number(event.target.value) })}
            disabled={isSaving || !(config?.reminderEnabled ?? true)}
            className="input-field mt-1 sm:max-w-xs"
          >
            {REMINDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {feedback && (
        <p
          role="status"
          className={cn(
            "mt-3 text-sm",
            feedback.tone === "ok" ? "text-status-qualified" : "text-status-blocked"
          )}
        >
          {feedback.text}
        </p>
      )}
    </section>
  );
}
