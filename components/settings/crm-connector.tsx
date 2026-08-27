"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Check,
  ChevronDown,
  Clipboard,
  Info,
  KeyRound,
  Loader2,
  Plug,
  RotateCcw,
  Save,
  Send,
  TriangleAlert,
} from "lucide-react";
import {
  AUTH_SCHEME_LABELS,
  CRM_PROVIDERS,
  CRM_PROVIDER_IDS,
  getProvider,
  LEAD_FIELD_KEYS,
  LEAD_FIELD_LABELS,
  needsCredential,
  type CrmProviderId,
  type LeadFieldKey,
} from "@/lib/integrations/providers";
import { cn } from "@/lib/utils";

interface ConnectorState {
  crmWebhookUrl: string | null;
  crmWebhookSecret: string | null;
  crmProvider: CrmProviderId;
  crmAuthTokenMask: string | null;
  crmAuthUser: string | null;
  crmFieldMap: Record<LeadFieldKey, string>;
}

interface CrmConnectorProps {
  state: ConnectorState;
  onSaved: (next: ConnectorState) => void;
}

/**
 * Collegamento al gestionale dell'agenzia.
 *
 * Il menu dei gestionali precompila schema di autenticazione e nomi dei campi,
 * ma non li nasconde: la mappatura resta visibile e modificabile, e il test di
 * connessione spedisce un lead finto con la mappatura reale. È quello che rende
 * usabile un preset non ancora confermato dal fornitore — un errore si vede in
 * cinque secondi qui, non alle otto di sera al primo lead vero.
 */
export function CrmConnector({ state, onSaved }: CrmConnectorProps) {
  const [providerId, setProviderId] = useState<CrmProviderId>(state.crmProvider);
  const [url, setUrl] = useState(state.crmWebhookUrl ?? "");
  const [token, setToken] = useState("");
  const [authUser, setAuthUser] = useState(state.crmAuthUser ?? "");
  const [fieldMap, setFieldMap] = useState<Record<LeadFieldKey, string>>(state.crmFieldMap);
  const [showMapping, setShowMapping] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const provider = useMemo(() => getProvider(providerId), [providerId]);

  // Cambiando gestionale la mappatura torna al preset di quello scelto: tenere
  // i nomi dei campi del gestionale precedente produrrebbe una consegna che
  // fallisce senza che si capisca il perché.
  useEffect(() => {
    setFieldMap(
      providerId === state.crmProvider ? state.crmFieldMap : { ...CRM_PROVIDERS[providerId].fieldMap }
    );
  }, [providerId, state.crmProvider, state.crmFieldMap]);

  const isMappingCustom = LEAD_FIELD_KEYS.some(
    (key) => fieldMap[key] !== provider.fieldMap[key]
  );

  async function save() {
    setIsSaving(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/user/integration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crmProvider: providerId,
          crmWebhookUrl: url.trim() || null,
          // Campo vuoto = non toccare la chiave già salvata. Per rimuoverla
          // c'è il pulsante apposito: altrimenti ogni salvataggio di un altro
          // campo cancellerebbe la credenziale.
          ...(token.trim() ? { crmAuthToken: token.trim() } : {}),
          ...(provider.auth === "basic" ? { crmAuthUser: authUser.trim() || null } : {}),
          crmFieldMap: isMappingCustom ? fieldMap : null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setFeedback({ tone: "error", text: data.message ?? "Salvataggio non riuscito." });
        return;
      }

      setToken("");
      onSaved(data as ConnectorState);
      setFeedback({ tone: "ok", text: "Collegamento salvato." });
    } catch {
      setFeedback({ tone: "error", text: "Errore di rete durante il salvataggio." });
    } finally {
      setIsSaving(false);
    }
  }

  async function test() {
    setIsTesting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/user/integration", { method: "POST" });
      const data = await response.json();

      setFeedback(
        response.ok
          ? {
              tone: "ok",
              text: `${provider.name} ha accettato il lead di prova (HTTP ${data.status}). Controlla che sia arrivato.`,
            }
          : { tone: "error", text: data.error ?? data.message ?? "Test non riuscito." }
      );
    } catch {
      setFeedback({ tone: "error", text: "Errore di rete durante il test." });
    } finally {
      setIsTesting(false);
    }
  }

  async function copySecret() {
    if (!state.crmWebhookSecret) return;
    await navigator.clipboard.writeText(state.crmWebhookSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-4 rounded-lg border border-border p-4">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Plug className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Collega il tuo gestionale
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Il lead entra nel gestionale appena passa in{" "}
        <span className="font-medium">Qualificato</span>, senza reinserirlo a mano.
      </p>

      <div className="mt-3">
        <label htmlFor="crm-provider" className="text-xs font-medium text-foreground">
          Gestionale
        </label>
        <select
          id="crm-provider"
          value={providerId}
          onChange={(event) => setProviderId(event.target.value as CrmProviderId)}
          className="input-field mt-1"
        >
          {CRM_PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>
              {CRM_PROVIDERS[id].name} — {CRM_PROVIDERS[id].tagline}
            </option>
          ))}
        </select>
      </div>

      {/* Il badge dice all'agente cosa sta configurando. Un preset non
          confermato dal fornitore non va spacciato per collegamento pronto. */}
      <div
        className={cn(
          "mt-3 flex items-start gap-2 rounded-lg border p-3",
          provider.verified
            ? "border-status-qualified/40 bg-status-qualified/5"
            : "border-status-pending/40 bg-status-pending/5"
        )}
      >
        {provider.verified ? (
          <BadgeCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-status-qualified"
            aria-hidden="true"
          />
        ) : (
          <TriangleAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-status-pending"
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 text-xs">
          <p className="font-semibold text-foreground">
            {provider.verified
              ? "Collegamento verificato"
              : "Preset da confermare col tuo fornitore"}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            {provider.verified
              ? provider.setupHint
              : `${provider.setupHint} Usa "Invia lead di prova" per verificare prima di andare in produzione.`}
          </p>
          <p className="mt-1 text-muted-foreground">
            Autenticazione: <span className="font-medium">{AUTH_SCHEME_LABELS[provider.auth]}</span>
            {provider.authHeaderName && (
              <>
                {" "}
                (<code className="break-all rounded bg-muted px-1">{provider.authHeaderName}</code>)
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor="crm-url" className="text-xs font-medium text-foreground">
          Endpoint
        </label>
        <input
          id="crm-url"
          type="url"
          inputMode="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={
            provider.allowedHosts?.[0]
              ? `https://${provider.allowedHosts[0]}/...`
              : "https://api.tuogestionale.it/lead"
          }
          className="input-field mt-1"
        />
        {provider.allowedHosts && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Ammessi solo indirizzi su {provider.allowedHosts.join(", ")}.
          </p>
        )}
      </div>

      {needsCredential(provider) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {provider.auth === "basic" && (
            <div>
              <label htmlFor="crm-user" className="text-xs font-medium text-foreground">
                Nome utente
              </label>
              <input
                id="crm-user"
                value={authUser}
                onChange={(event) => setAuthUser(event.target.value)}
                className="input-field mt-1"
              />
            </div>
          )}

          <div className={cn(provider.auth !== "basic" && "sm:col-span-2")}>
            <label htmlFor="crm-token" className="text-xs font-medium text-foreground">
              Chiave API
            </label>
            <input
              id="crm-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={state.crmAuthTokenMask ?? "Incolla la chiave del tuo gestionale"}
              className="input-field mt-1"
            />
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <KeyRound className="h-3 w-3 shrink-0" aria-hidden="true" />
              {state.crmAuthTokenMask
                ? `Chiave salvata: ${state.crmAuthTokenMask}. Lascia vuoto per non modificarla.`
                : "Salvata cifrata. Non viene mai rimandata al browser."}
            </p>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={save} disabled={isSaving} className="btn-brand shrink-0">
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          Salva collegamento
        </button>
        <button
          type="button"
          onClick={test}
          disabled={isTesting || !state.crmWebhookUrl}
          className="btn-outline shrink-0"
        >
          {isTesting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          Invia lead di prova
        </button>
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

      {/* --- Mappatura dei campi --- */}
      <div className="mt-4 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setShowMapping((open) => !open)}
          aria-expanded={showMapping}
          className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors duration-200 hover:text-foreground"
        >
          Mappatura dei campi
          {isMappingCustom && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium normal-case text-primary">
              personalizzata
            </span>
          )}
          <ChevronDown
            className={cn(
              "ml-auto h-4 w-4 shrink-0 transition-transform duration-200",
              showMapping && "rotate-180"
            )}
            aria-hidden="true"
          />
        </button>

        {showMapping && (
          <div className="mt-3">
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              A sinistra il dato che abbiamo, a destra il nome del campo nel tuo gestionale. Se un
              campo lì non esiste, lascia la casella vuota: non verrà inviato.
            </p>

            <div className="mt-3 space-y-2">
              {LEAD_FIELD_KEYS.map((key) => (
                <div key={key} className="grid grid-cols-2 items-center gap-2">
                  <label htmlFor={`map-${key}`} className="text-xs text-foreground">
                    {LEAD_FIELD_LABELS[key]}
                  </label>
                  <input
                    id={`map-${key}`}
                    value={fieldMap[key]}
                    onChange={(event) =>
                      setFieldMap((current) => ({ ...current, [key]: event.target.value }))
                    }
                    maxLength={60}
                    placeholder="non inviare"
                    className="input-field text-xs"
                  />
                </div>
              ))}
            </div>

            {isMappingCustom && (
              <button
                type="button"
                onClick={() => setFieldMap({ ...provider.fieldMap })}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Ripristina i nomi predefiniti di {provider.name}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Il segreto di firma ha senso solo dove firmiamo davvero. */}
      {provider.auth === "hmac" && state.crmWebhookSecret && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            Segreto di firma — il tuo gestionale può usarlo per verificare l&apos;header{" "}
            <code className="break-all rounded bg-muted px-1">X-PropertyTech-Signature</code> (HMAC-SHA256 del
            corpo della richiesta).
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-foreground">
              {state.crmWebhookSecret}
            </code>
            <button
              type="button"
              onClick={copySecret}
              aria-label="Copia segreto di firma"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-foreground transition-all duration-200 hover:bg-muted"
            >
              {copied ? (
                <Check className="h-4 w-4 text-status-qualified" aria-hidden="true" />
              ) : (
                <Clipboard className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
