"use client";

import { useEffect, useState } from "react";
import { Check, Clipboard, Link2, Loader2, Mail, QrCode, Unplug } from "lucide-react";
import type { WhatsAppConfigView } from "@/lib/whatsapp/view-types";

function CopyableField({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Mail }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-foreground">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copia ${label}`}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-foreground transition-all duration-200 hover:bg-muted"
        >
          {copied ? <Check className="h-4 w-4 text-status-qualified" /> : <Clipboard className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function ConnectionPanel({ onConnectionChange }: { onConnectionChange?: () => void }) {
  const [config, setConfig] = useState<WhatsAppConfigView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [phoneAccountId, setPhoneAccountId] = useState("");

  useEffect(() => {
    fetch("/api/whatsapp/config")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: WhatsAppConfigView | null) => {
        if (data) {
          setConfig(data);
          setPhoneNumber(data.phoneNumber ?? "");
          setPhoneAccountId(data.metaPhoneAccountId ?? "");
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function save(disconnect = false) {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/whatsapp/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          disconnect ? { disconnect: true } : { phoneNumber, metaAccessToken: accessToken, metaPhoneAccountId: phoneAccountId }
        ),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? "Salvataggio non riuscito. Verifica i dati inseriti.");
        return;
      }

      setConfig(data as WhatsAppConfigView);
      setAccessToken("");
      if (disconnect) {
        setPhoneNumber("");
        setPhoneAccountId("");
      }
      onConnectionChange?.();
    } catch {
      setError("Errore di rete durante il salvataggio.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Impossibile caricare la configurazione WhatsApp.
      </div>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Configurazione WhatsApp &amp; Webhook Portali</h2>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            config.isConnected
              ? "bg-status-qualified/10 text-status-qualified"
              : "bg-status-blocked/10 text-status-blocked"
          }`}
        >
          <span aria-hidden="true">{config.isConnected ? "🟢" : "🔴"}</span>
          {config.isConnected ? "Connesso" : "Disconnesso"}
        </span>
      </div>

        {/* `[&>*]:min-w-0`: anche gli elementi di una griglia CSS hanno
            `min-width: auto`, quindi una colonna con dentro un URL lungo si
            allarga oltre lo schermo invece di lasciar troncare il contenuto.
            È lo stesso inciampo del flex, un livello più su. */}
        <div className="mt-5 grid gap-6 [&>*]:min-w-0 lg:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <QrCode className="h-3.5 w-3.5" />
            Abbinamento numero WhatsApp Business
          </h3>

          {config.isConnected ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-sm text-foreground">
                  Numero collegato:{" "}
                  <span className="font-medium">{config.phoneNumber ?? "non specificato"}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Phone Account ID: {config.metaPhoneAccountId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => save(true)}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted disabled:opacity-50"
              >
                <Unplug className="h-4 w-4" />
                Disconnetti
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {/* Il segnaposto che prometteva l'abbinamento via QR è stato
                  rimosso: la Cloud API di Meta non lo prevede, e lasciarlo
                  significava far aspettare una funzione che non sarebbe
                  arrivata. Il QR c'è, ma serve ad acquisire notizie — vedi
                  QrAcquisitionCard, che compare a connessione avvenuta. */}
              <div>
                <label htmlFor="wa-phone" className="text-xs font-medium text-muted-foreground">
                  Numero WhatsApp Business
                </label>
                <input
                  id="wa-phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder="+39 02 1234567"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div>
                <label htmlFor="wa-account" className="text-xs font-medium text-muted-foreground">
                  Meta Phone Account ID
                </label>
                <input
                  id="wa-account"
                  type="text"
                  value={phoneAccountId}
                  onChange={(event) => setPhoneAccountId(event.target.value)}
                  placeholder="123456789012345"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div>
                <label htmlFor="wa-token" className="text-xs font-medium text-muted-foreground">
                  Meta Access Token
                </label>
                <input
                  id="wa-token"
                  type="password"
                  value={accessToken}
                  onChange={(event) => setAccessToken(event.target.value)}
                  placeholder="EAAG..."
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {error && (
                <p role="alert" className="text-sm text-status-blocked">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={() => save(false)}
                disabled={isSaving || !accessToken || !phoneAccountId}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 disabled:opacity-50"
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Connetti WhatsApp
              </button>
            </div>
          )}
        </div>

        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" />
            Ingaggio istantaneo dai portali
          </h3>
          <p className="mt-2 text-xs text-muted-foreground">
            Inserisci questi riferimenti nel pannello di Immobiliare.it, Idealista o Casa.it per
            ricevere i lead in tempo reale.
          </p>

          <div className="mt-3 space-y-3">
            <CopyableField
              label="Email dedicata per l'inoltro lead"
              value={`inbound-${config.inboundToken}@tuosaas.it`}
              icon={Mail}
            />
            <CopyableField
              label="URL Webhook portali"
              value={`${origin}/api/whatsapp/inbound-lead?token=${config.inboundToken}`}
              icon={Link2}
            />
            {config.webhookVerifyToken && (
              <CopyableField
                label="Verify Token (Meta Cloud API)"
                value={config.webhookVerifyToken}
                icon={QrCode}
              />
            )}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Nel pannello Meta imposta come Callback URL{" "}
            <code className="rounded bg-muted px-1 py-0.5">{origin}/api/whatsapp/webhook</code>
          </p>
        </div>
      </div>
    </section>
  );
}
