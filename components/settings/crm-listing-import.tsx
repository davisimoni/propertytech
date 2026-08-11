"use client";

import { useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { getProvider, needsCredential, type CrmProviderId } from "@/lib/integrations/providers";
import { cn } from "@/lib/utils";

interface ListingImportState {
  crmProvider: CrmProviderId;
  crmListingImportUrl: string | null;
  crmListingImportedAt: string | null;
}

interface CrmListingImportProps {
  state: ListingImportState;
  onSaved: (next: Partial<ListingImportState>) => void;
}

const DATE_FORMAT = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Import annunci dal gestionale: direzione opposta a `CrmConnector`. Compare
 * solo per i gestionali che hanno un'API propria da leggere (Zapier, Make e
 * il webhook generico sono canali di consegna, non hanno un portafoglio
 * immobili da esporre).
 */
export function CrmListingImport({ state, onSaved }: CrmListingImportProps) {
  const [url, setUrl] = useState(state.crmListingImportUrl ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const provider = getProvider(state.crmProvider);
  if (!needsCredential(provider)) return null;

  async function save() {
    setIsSaving(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/user/integration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crmListingImportUrl: url.trim() || null }),
      });

      const data = await response.json();

      if (!response.ok) {
        setFeedback({ tone: "error", text: data.message ?? "Salvataggio non riuscito." });
        return;
      }

      onSaved(data);
      setFeedback({ tone: "ok", text: "Indirizzo salvato." });
    } catch {
      setFeedback({ tone: "error", text: "Errore di rete durante il salvataggio." });
    } finally {
      setIsSaving(false);
    }
  }

  async function sync() {
    setIsSyncing(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/integrations/crm/import-listings", { method: "POST" });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setFeedback({ tone: "error", text: data.error ?? "Sincronizzazione non riuscita." });
        return;
      }

      onSaved({ crmListingImportedAt: new Date().toISOString() });
      setFeedback({
        tone: "ok",
        text: `Sincronizzati ${data.imported} annunci${data.skipped ? `, ${data.skipped} saltati` : ""}.`,
      });
    } catch {
      setFeedback({ tone: "error", text: "Errore di rete durante la sincronizzazione." });
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-border p-4">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Importa annunci dal gestionale
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Direzione opposta all&apos;export lead: qui PropertyTech legge il portafoglio immobili di{" "}
        {provider.name} invece di inviargli dati. Riusa la stessa chiave API configurata sopra.
      </p>

      <div className="mt-3">
        <label htmlFor="crm-import-url" className="text-xs font-medium text-foreground">
          Endpoint di lettura annunci
        </label>
        <input
          id="crm-import-url"
          type="url"
          inputMode="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://api.tuogestionale.it/immobili"
          className="input-field mt-1"
        />
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={save} disabled={isSaving} className="btn-outline shrink-0">
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Salva indirizzo
        </button>
        <button
          type="button"
          onClick={sync}
          disabled={isSyncing || !state.crmListingImportUrl}
          className="btn-brand shrink-0"
        >
          {isSyncing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          Sincronizza ora
        </button>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        {state.crmListingImportedAt
          ? `Ultima sincronizzazione: ${DATE_FORMAT.format(new Date(state.crmListingImportedAt))}.`
          : "Nessuna sincronizzazione ancora eseguita."}{" "}
        Con l&apos;indirizzo configurato, gira anche in automatico se collegata a uno scheduler.
      </p>

      {feedback && (
        <p
          role="status"
          className={cn(
            "mt-2 text-sm",
            feedback.tone === "ok" ? "text-status-qualified" : "text-status-blocked"
          )}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}
