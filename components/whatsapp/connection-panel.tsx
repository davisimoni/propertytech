"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  Check,
  Clipboard,
  KeyRound,
  Link2,
  Loader2,
  Mail,
  Smartphone,
  Unplug,
  HelpCircle,
} from "lucide-react";
import { PortalSetupDialog } from "@/components/whatsapp/portal-setup-dialog";
import type { WhatsAppConfigView } from "@/lib/whatsapp/view-types";
import {
  WHATSAPP_PROVIDER_IDS,
  WHATSAPP_PROVIDERS,
  type WhatsAppProviderId,
} from "@/lib/whatsapp/provider";
import {
  isMetaSignupConfigured,
  MetaConnectButton,
} from "@/components/whatsapp/meta-connect-button";
import { QrConnect } from "@/components/whatsapp/qr-connect";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/shared/toast-provider";
import { cn } from "@/lib/utils";

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
          className="inline-flex h-11 w-11 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg border border-border text-foreground transition-all duration-200 hover:bg-muted"
        >
          {copied ? <Check className="h-4 w-4 text-status-qualified" /> : <Clipboard className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-base text-foreground sm:text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/40";

export function ConnectionPanel({ onConnectionChange }: { onConnectionChange?: () => void }) {
  const [config, setConfig] = useState<WhatsAppConfigView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<WhatsAppProviderId>("meta");
  // Chiusa di default: i campi tecnici (Phone Account ID, token, Verify
  // Token) non devono comparire alla prima apertura della schermata, solo a
  // chi sceglie esplicitamente di configurare le credenziali a mano.
  const [showAdvanced, setShowAdvanced] = useState(false);
  /**
   * Disconnessione in attesa di conferma.
   *
   * E' l'azione piu' costosa dell'intera applicazione: staccare WhatsApp
   * spegne la qualificazione automatica, e da quel momento i messaggi dei
   * clienti restano senza risposta finche' qualcuno non se ne accorge.
   */
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  /** Istruzioni per i portali, aperte su richiesta. */
  const [showPortalSetup, setShowPortalSetup] = useState(false);
  const [portalCopied, setPortalCopied] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const { showToast } = useToast();

  // --- Meta ---
  const [phoneNumber, setPhoneNumber] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [phoneAccountId, setPhoneAccountId] = useState("");

  // --- Twilio ---
  const [twilioAccountSid, setTwilioAccountSid] = useState("");
  const [twilioAuthToken, setTwilioAuthToken] = useState("");
  const [twilioWhatsAppNumber, setTwilioWhatsAppNumber] = useState("");

  // --- Webhook generico ---
  const [genericSendUrl, setGenericSendUrl] = useState("");
  const [genericAuthToken, setGenericAuthToken] = useState("");

  const loadConfig = useCallback(async () => {
    const response = await fetch("/api/whatsapp/config");
    const data: WhatsAppConfigView | null = response.ok ? await response.json() : null;

    if (data) {
      setConfig(data);
      setProvider(data.provider);
      setPhoneNumber(data.phoneNumber ?? "");
      setPhoneAccountId(data.metaPhoneAccountId ?? "");
      setTwilioAccountSid(data.twilioAccountSid ?? "");
      setTwilioWhatsAppNumber(data.twilioWhatsAppNumber ?? "");
      setGenericSendUrl(data.genericSendUrl ?? "");
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Come `save()`: il resto della pagina (numero collegato, QR di
  // acquisizione) deve rimontare anche quando la connessione arriva
  // dall'Embedded Signup guidato, non solo dal salvataggio manuale.
  const handleGuidedConnect = useCallback(() => {
    loadConfig();
    onConnectionChange?.();
  }, [loadConfig, onConnectionChange]);

  async function save(disconnect = false) {
    setIsSaving(true);
    setError(null);

    // Una sessione QR si stacca dalla sua rotta, non da `/config`: oltre a
    // ripulire il database bisogna chiudere il socket e cancellare le
    // credenziali sul microservizio. Passare di qui lascerebbe la sessione
    // viva là fuori, ancora capace di inviare a nome dell'agenzia.
    if (disconnect && provider === "qr") {
      try {
        const response = await fetch("/api/whatsapp/qr/generate", { method: "DELETE" });
        if (!response.ok) {
          setError("Disconnessione non riuscita. Riprova.");
          return;
        }
        setConfig((await response.json()) as WhatsAppConfigView);
        onConnectionChange?.();
        showToast("WhatsApp disconnesso: l'assistente non risponde piu'.", "success");
      } catch {
        setError("Errore di rete durante la disconnessione.");
        showToast("Disconnessione non riuscita.", "error");
      } finally {
        setIsSaving(false);
        setConfirmingDisconnect(false);
      }
      return;
    }

    const payload = disconnect
      ? { provider, disconnect: true }
      : provider === "twilio"
        ? {
            provider,
            twilioAccountSid,
            twilioAuthToken,
            twilioWhatsAppNumber,
          }
        : provider === "generic"
          ? {
              provider,
              genericSendUrl,
              ...(genericAuthToken ? { genericAuthToken } : {}),
            }
          : {
              provider,
              phoneNumber,
              metaAccessToken: accessToken,
              metaPhoneAccountId: phoneAccountId,
            };

    try {
      const response = await fetch("/api/whatsapp/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? "Salvataggio non riuscito. Verifica i dati inseriti.");
        return;
      }

      setConfig(data as WhatsAppConfigView);
      setAccessToken("");
      setTwilioAuthToken("");
      setGenericAuthToken("");
      if (disconnect) {
        setPhoneNumber("");
        setPhoneAccountId("");
        setTwilioAccountSid("");
        setTwilioWhatsAppNumber("");
        setGenericSendUrl("");
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

  /**
   * Il link che l'agenzia consegna al portale.
   *
   * Composto una volta sola qui: serve al campo, al pulsante di copia e
   * alla modale delle istruzioni, e tre costruzioni separate della stessa
   * stringa divergono al primo ritocco del percorso.
   */
  const portalWebhookUrl = config
    ? `${origin}/api/whatsapp/inbound-lead?token=${config.inboundToken}`
    : "";

  async function copyPortalWebhook() {
    await navigator.clipboard.writeText(portalWebhookUrl);
    setPortalCopied(true);
    setTimeout(() => setPortalCopied(false), 2000);
  }

  async function copyInboundEmail() {
    if (!config?.inboundEmail) return;
    await navigator.clipboard.writeText(config.inboundEmail);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  }
  const canSave =
    provider === "twilio"
      ? Boolean(twilioAccountSid && twilioAuthToken && twilioWhatsAppNumber)
      : provider === "generic"
        ? Boolean(genericSendUrl)
        : Boolean(accessToken && phoneAccountId);

  return (
    <>
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
          {config.isConnected ? `Connesso (${WHATSAPP_PROVIDERS[config.provider].name})` : "Disconnesso"}
        </span>
      </div>

        {/* `[&>*]:min-w-0`: anche gli elementi di una griglia CSS hanno
            `min-width: auto`, quindi una colonna con dentro un URL lungo si
            allarga oltre lo schermo invece di lasciar troncare il contenuto.
            È lo stesso inciampo del flex, un livello più su. */}
        <div className="mt-5 grid gap-6 [&>*]:min-w-0 lg:grid-cols-2">
        <div>
          {/* Non un'icona QR: il collegamento avviene via Meta Cloud API, non
              inquadrando un codice come su WhatsApp Web. Il QR che l'agenzia
              trova altrove serve a un'altra cosa — farsi contattare dai
              clienti — e mostrarne l'icona qui alimentava proprio quella
              confusione. */}
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Smartphone className="h-3.5 w-3.5" />
            Abbinamento numero WhatsApp Business
          </h3>

          {config.isConnected ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                {config.provider === "qr" ? (
                  <>
                    <p className="text-sm text-foreground">
                      Numero collegato:{" "}
                      <span className="font-medium">
                        {config.phoneNumber ?? "in attesa dal dispositivo"}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Collegato via QR. Se scolleghi il dispositivo da WhatsApp sul telefono, il
                      collegamento cade e va rifatta la scansione.
                    </p>
                  </>
                ) : config.provider === "twilio" ? (
                  <>
                    <p className="text-sm text-foreground">
                      Numero Twilio:{" "}
                      <span className="font-medium">{config.twilioWhatsAppNumber ?? "non specificato"}</span>
                    </p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      Account SID: {config.twilioAccountSid}
                    </p>
                  </>
                ) : config.provider === "generic" ? (
                  <p className="break-all text-sm text-foreground">
                    Endpoint di invio:{" "}
                    <span className="font-medium">{config.genericSendUrl}</span>
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-foreground">
                      Numero collegato:{" "}
                      <span className="font-medium">{config.phoneNumber ?? "non specificato"}</span>
                    </p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      Phone Account ID: {config.metaPhoneAccountId}
                    </p>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setConfirmingDisconnect(true)}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted disabled:opacity-50"
              >
                <Unplug className="h-4 w-4" />
                Disconnetti
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              {/* --- Collegamento rapido con QR: la strada preferita.
                  Nessun account sviluppatore, nessuna verifica Business: si
                  inquadra un codice col telefono e si è operativi. È il
                  percorso che riduce l'abbandono in fase di attivazione. --- */}
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                <h4 className="text-sm font-semibold text-foreground">
                  Collega il tuo WhatsApp Business
                </h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Inquadra un codice col telefono, come su WhatsApp Web: nessun account
                  sviluppatore da creare. L&apos;AI inizia subito a qualificare i lead dai portali.
                </p>
                <div className="mt-3">
                  <QrConnect onConnected={handleGuidedConnect} />
                </div>
              </div>

              {/* --- Collegamento ufficiale Meta: mostrato solo dove è
                  davvero attivabile. Su un ambiente senza credenziali Meta
                  questo blocco proponeva una strada chiusa, e l'avviso che lo
                  spiegava rubava attenzione alla CTA che invece funziona. --- */}
              {isMetaSignupConfigured() && (
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <h4 className="text-sm font-semibold text-foreground">
                    Hai già un account Meta Business?
                  </h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Collega WhatsApp Cloud API, il canale ufficiale di Meta.
                  </p>
                  <div className="mt-3">
                    <MetaConnectButton onConnected={handleGuidedConnect} />
                  </div>
                </div>
              )}

              {/* --- Configurazione avanzata: nascosta finché non richiesta
                  esplicitamente — è il percorso per chi vuole (o deve)
                  inserire a mano credenziali custom, non quello standard. --- */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((value) => !value)}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground"
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform duration-200",
                      showAdvanced && "rotate-180"
                    )}
                  />
                  Configurazione avanzata (Developer)
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-3 rounded-xl border border-dashed border-border p-4">
                    <div>
                      <label htmlFor="wa-provider" className="text-xs font-medium text-muted-foreground">
                        Provider di messaggistica
                      </label>
                      <select
                        id="wa-provider"
                        value={provider}
                        onChange={(event) => {
                          setError(null);
                          setProvider(event.target.value as WhatsAppProviderId);
                        }}
                        className="input-field mt-1"
                      >
                        {WHATSAPP_PROVIDER_IDS.map((id) => (
                          <option key={id} value={id}>
                            {WHATSAPP_PROVIDERS[id].name} — {WHATSAPP_PROVIDERS[id].tagline}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {WHATSAPP_PROVIDERS[provider].setupHint}
                      </p>
                    </div>

                    {provider === "meta" && (
                      <>
                        {/* Il segnaposto che prometteva l'abbinamento via QR è
                            stato rimosso: la Cloud API di Meta non lo prevede,
                            e lasciarlo significava far aspettare una funzione
                            che non sarebbe arrivata. Il QR c'è, ma serve ad
                            acquisire notizie — vedi QrAcquisitionCard, che
                            compare a connessione avvenuta. */}
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
                            className={inputClass}
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
                            className={inputClass}
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
                            className={inputClass}
                          />
                        </div>
                      </>
                    )}

                    {provider === "twilio" && (
                      <>
                        <div>
                          <label htmlFor="wa-twilio-sid" className="text-xs font-medium text-muted-foreground">
                            Account SID
                          </label>
                          <input
                            id="wa-twilio-sid"
                            type="text"
                            value={twilioAccountSid}
                            onChange={(event) => setTwilioAccountSid(event.target.value)}
                            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label htmlFor="wa-twilio-token" className="text-xs font-medium text-muted-foreground">
                            Auth Token
                          </label>
                          <input
                            id="wa-twilio-token"
                            type="password"
                            value={twilioAuthToken}
                            onChange={(event) => setTwilioAuthToken(event.target.value)}
                            placeholder={config.hasTwilioAuthToken ? "Lascia vuoto per non modificarlo" : "..."}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label htmlFor="wa-twilio-number" className="text-xs font-medium text-muted-foreground">
                            Numero WhatsApp Twilio
                          </label>
                          <input
                            id="wa-twilio-number"
                            type="text"
                            value={twilioWhatsAppNumber}
                            onChange={(event) => setTwilioWhatsAppNumber(event.target.value)}
                            placeholder="whatsapp:+14155238886"
                            className={inputClass}
                          />
                        </div>
                      </>
                    )}

                    {provider === "generic" && (
                      <>
                        <div>
                          <label htmlFor="wa-generic-url" className="text-xs font-medium text-muted-foreground">
                            Endpoint di invio del tuo relay
                          </label>
                          <input
                            id="wa-generic-url"
                            type="url"
                            value={genericSendUrl}
                            onChange={(event) => setGenericSendUrl(event.target.value)}
                            placeholder="https://relay.tuo-bsp.it/send"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label htmlFor="wa-generic-token" className="text-xs font-medium text-muted-foreground">
                            Token (facoltativo)
                          </label>
                          <input
                            id="wa-generic-token"
                            type="password"
                            value={genericAuthToken}
                            onChange={(event) => setGenericAuthToken(event.target.value)}
                            placeholder={config.hasGenericAuthToken ? "Lascia vuoto per non modificarlo" : "..."}
                            className={inputClass}
                          />
                        </div>
                      </>
                    )}

                    {error && (
                      <p role="alert" className="text-sm text-status-blocked">
                        {error}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => save(false)}
                      disabled={isSaving || !canSave}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 disabled:opacity-50"
                    >
                      {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                      Connetti WhatsApp
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" />
            Collegamento Portali (Immobiliare.it, Idealista, Casa.it)
          </h3>

          {/* La spiegazione prima del link, e in evidenza.

              Il box mostrava un URL con un token dentro e nient'altro: chi non
              sa gia' cos'e' un webhook legge una stringa incomprensibile e
              chiude la pagina. Prima si dice COSA succede quando il
              collegamento c'e', poi si da' la cosa da incollare. */}
          <p className="mt-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm leading-relaxed text-foreground">
            Quando un cliente ti invia una richiesta su un portale immobiliare, il sistema gli
            scrive su WhatsApp in pochi secondi e comincia a qualificarlo, senza che tu debba
            fare niente.
          </p>

          <div className="mt-3 space-y-3">
            {/* Due strade, dichiarate come tali.

                Prima ce n'era una sola in evidenza — il link webhook — e
                l'email compariva sotto come ripiego senza nome. Ma i portali
                italiani non hanno un pulsante "aggiungi webhook" che l'agenzia
                possa premere da sola: su Immobiliare.it, Idealista e Casa.it
                l'inoltro lo attiva il portale su richiesta. L'inoltro email
                invece l'agenzia lo configura da sola, nella propria casella,
                senza chiedere niente a nessuno: per questo viene prima. */}

            {/* --- Opzione 1: inoltro email --- */}
            <div className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Mail className="h-3.5 w-3.5 text-primary" />
                  Opzione 1 — Inoltro email
                </span>
                {config.inboundEmail && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    Consigliata
                  </span>
                )}
              </div>

              {config.inboundEmail ? (
                <>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Crea una regola di inoltro automatico nella casella email dell&apos;agenzia,
                    per mandare a questo indirizzo le notifiche di Immobiliare.it, Idealista e
                    Casa.it. L&apos;assistente legge il lead e invia subito il messaggio WhatsApp.
                  </p>
                  <code className="mt-2 block truncate rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    {config.inboundEmail}
                  </code>
                  <button
                    type="button"
                    onClick={copyInboundEmail}
                    className="btn-brand mt-2 text-xs"
                  >
                    {emailCopied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Clipboard className="h-4 w-4" />
                    )}
                    {emailCopied ? "Copiato!" : "Copia indirizzo di inoltro"}
                  </button>
                </>
              ) : (
                /* Nessun indirizzo mostrato finche' il dominio di ricezione non
                   e' configurato. Un recapito che non riceve fa perdere i lead
                   IN SILENZIO — nessun rimbalzo, nessun errore in dashboard,
                   solo contatti che non arrivano mai — ed e' gia' successo con
                   un dominio segnaposto. */
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  L&apos;inoltro email non e&apos; ancora attivo su questo ambiente. Nel frattempo
                  usa l&apos;Opzione 2 qui sotto: non mostriamo un recapito prima che sappia
                  ricevere, perche&apos; i lead inoltrati andrebbero persi senza che tu te ne
                  accorga.
                </p>
              )}
            </div>

            {/* --- Opzione 2: webhook / gestionale --- */}
            <div className="rounded-lg border border-border p-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Link2 className="h-3.5 w-3.5 text-primary" />
                Opzione 2 — Webhook o gestionale
              </span>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Invia questo link al tuo referente commerciale del portale, oppure incollalo nella
                sezione &laquo;Webhook notifiche in uscita&raquo; del tuo gestionale immobiliare
                (Miogest, Gestim, Realigro e simili).
              </p>
              <code className="mt-2 block truncate rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {portalWebhookUrl}
              </code>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={copyPortalWebhook} className="btn-brand text-xs">
                  {portalCopied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Clipboard className="h-4 w-4" />
                  )}
                  {portalCopied ? "Copiato!" : "Copia Link Webhook Portali"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPortalSetup(true)}
                  className="btn-outline text-xs"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  Istruzioni di collegamento
                </button>
              </div>
            </div>

            {/* Da qui in giu' e' roba del canale WhatsApp, non dei portali:
                serve a chi collega il numero, una volta sola, e mescolarla col
                link da consegnare a Immobiliare.it era meta' del problema. */}
            {((provider === "meta" && config.webhookVerifyToken) || provider === "generic") && (
              <p className="border-t border-border pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Configurazione tecnica del canale WhatsApp
              </p>
            )}

            {provider === "meta" && config.webhookVerifyToken && (
              <CopyableField
                label="Verify Token (Meta Cloud API)"
                value={config.webhookVerifyToken}
                icon={KeyRound}
              />
            )}
            {provider === "generic" && (
              <CopyableField
                label="URL Webhook messaggi in arrivo (relay)"
                value={`${origin}${WHATSAPP_PROVIDERS.generic.webhookPathHint}?token=${config.inboundToken}`}
                icon={Link2}
              />
            )}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            {provider === "twilio" ? (
              <>
                Nella Console Twilio imposta come webhook &quot;When a message comes in&quot;{" "}
                <code className="break-all rounded bg-muted px-1 py-0.5">
                  {origin}
                  {WHATSAPP_PROVIDERS.twilio.webhookPathHint}
                </code>
              </>
            ) : provider === "generic" ? (
              "Il tuo relay deve inoltrare i messaggi in arrivo all'URL dei messaggi qui sopra, con il token come Bearer o `?token=`."
            ) : (
              <>
                Nel pannello Meta imposta come Callback URL{" "}
                <code className="break-all rounded bg-muted px-1 py-0.5">
                  {origin}
                  {WHATSAPP_PROVIDERS.meta.webhookPathHint}
                </code>
              </>
            )}
          </p>
        </div>
      </div>
      </section>

      {showPortalSetup && (
        <PortalSetupDialog
          webhookUrl={portalWebhookUrl}
          inboundEmail={config?.inboundEmail ?? null}
          onClose={() => setShowPortalSetup(false)}
        />
      )}

      {confirmingDisconnect && (
        <ConfirmDialog
          title="Disconnettere WhatsApp?"
          description="L'assistente smette di rispondere ai clienti che scrivono, e i messaggi in arrivo restano senza risposta finche' non ricolleghi il numero. Le conversazioni gia' salvate restano."
          confirmLabel="Disconnetti"
          cancelLabel="Torna indietro"
          isWorking={isSaving}
          onConfirm={() => save(true)}
          onCancel={() => setConfirmingDisconnect(false)}
        />
      )}
    </>
  );
}
