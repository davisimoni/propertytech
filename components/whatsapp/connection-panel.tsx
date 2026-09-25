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
  Mic,
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
import { InfoTip } from "@/components/shared/info-tip";
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
   * Impostazioni tecniche del canale (Verify Token, indirizzi dei webhook).
   *
   * Chiuse anche queste, e per lo stesso motivo: servono una volta sola, a chi
   * ha collegato il numero a mano. Lasciate aperte occupavano su telefono piu'
   * spazio della parte che l'agenzia usa davvero, cioe' il collegamento dei
   * portali, e facevano sembrare tecnica una schermata che non lo e'.
   */
  const [showChannelSetup, setShowChannelSetup] = useState(false);
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
  /**
   * Quale delle due strade di collegamento è aperta.
   *
   * Erano due riquadri impilati: insieme occupavano mezza schermata per
   * mostrare due cose alternative, di cui l'agenzia ne usa una sola. A schede
   * l'altezza è quella di una sola, e la scelta resta visibile.
   *
   * Parte da `email` perché è quella che l'agenzia attiva da sola nella
   * propria casella, mentre il webhook dipende dal portale. Quando l'inoltro
   * non è disponibile su questo ambiente la scheda lo dice e offre il
   * passaggio all'altra: si è preferito questo a un cambio di scheda
   * automatico, che avrebbe spostato l'interfaccia sotto le mani dell'agente
   * senza spiegare perché la prima strada non c'era.
   */
  const [portalTab, setPortalTab] = useState<"email" | "webhook">("email");
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
  /**
   * I campi tecnici del canale, gia' risolti per il provider attivo.
   *
   * Raccolti qui e non nel JSX perche' erano tre condizioni annidate che
   * producevano, in fondo, un elenco di etichette da copiare: tenerle fuori
   * rende visibile a colpo d'occhio che l'accordion e' vuoto per il
   * collegamento via QR, dove non c'e' niente da configurare a mano.
   */
  const impostazioniTecniche: { label: string; value: string; icon: typeof Mail }[] = [];
  if (provider === "meta" && config.webhookVerifyToken) {
    impostazioniTecniche.push({
      label: "Verify Token (Meta Cloud API)",
      value: config.webhookVerifyToken,
      icon: KeyRound,
    });
  }
  if (provider === "twilio") {
    impostazioniTecniche.push({
      label: "Webhook Twilio (When a message comes in)",
      value: `${origin}${WHATSAPP_PROVIDERS.twilio.webhookPathHint}`,
      icon: Link2,
    });
  }
  if (provider === "generic") {
    impostazioniTecniche.push({
      label: "Webhook messaggi in arrivo (relay)",
      value: `${origin}${WHATSAPP_PROVIDERS.generic.webhookPathHint}?token=${config.inboundToken}`,
      icon: Link2,
    });
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
        <h2 className="text-sm font-semibold text-foreground">WhatsApp e portali</h2>
        {/* Il pallino e' disegnato, non e' piu' un'emoji: le emoji cambiano
            forma e colore da un sistema all'altro, e su Windows quella rossa
            arrivava arancione, cioe' la tinta che altrove significa "in
            corso". Un quadratino di colore del tema dice la stessa cosa e la
            dice uguale ovunque. */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            config.isConnected
              ? "bg-status-qualified/10 text-status-qualified"
              : "bg-status-blocked/10 text-status-blocked"
          }`}
        >
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full ${
              config.isConnected ? "bg-status-qualified" : "bg-status-blocked"
            }`}
          />
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
            <Smartphone className="h-3.5 w-3.5 shrink-0" />
            Il tuo numero WhatsApp
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
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="min-w-0">Collegato via QR.</span>
                      <InfoTip label="Se scolleghi il dispositivo da WhatsApp sul telefono, il collegamento cade e va rifatta la scansione." />
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
                className="btn-outline text-sm"
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
                  Inquadri un codice col telefono, come su WhatsApp Web. Bastano due minuti.
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
                  className="flex min-h-11 md:mouse:min-h-0 items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground"
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform duration-200",
                      showAdvanced && "rotate-180"
                    )}
                  />
                  Configurazione avanzata (per sviluppatori)
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
                            {WHATSAPP_PROVIDERS[id].name} ({WHATSAPP_PROVIDERS[id].tagline})
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
                      className="btn-brand w-full sm:w-auto"
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
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">Portali immobiliari</span>
            <InfoTip label="Vale per Immobiliare.it, Idealista, Casa.it e per i gestionali che sanno inoltrare un lead." />
          </h3>

          {/* La spiegazione prima del link, e in evidenza.

              Il box mostrava un URL con un token dentro e nient'altro: chi non
              sa gia' cos'e' un webhook legge una stringa incomprensibile e
              chiude la pagina. Prima si dice COSA succede quando il
              collegamento c'e', poi si da' la cosa da incollare. */}
          <p className="mt-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm leading-relaxed text-foreground">
            Chi ti scrive da un portale riceve un messaggio WhatsApp in pochi secondi, e
            l&apos;assistente lo qualifica al posto tuo.
          </p>

          <div className="mt-3 space-y-3">
            {/* Due strade alternative, in un riquadro solo.

                I portali italiani non hanno un pulsante "aggiungi webhook" che
                l'agenzia possa premere da sola: su Immobiliare.it, Idealista e
                Casa.it l'inoltro lo attiva il portale su richiesta. L'inoltro
                email invece l'agenzia lo configura da sola, nella propria
                casella, senza chiedere niente a nessuno: per questo è la
                scheda aperta per prima. */}
            <div className="rounded-lg border border-border">
              <div
                role="tablist"
                aria-label="Modo di collegare i portali"
                className="flex gap-1 border-b border-border p-1"
              >
                {(
                  [
                    { id: "email", label: "Inoltro email", icon: Mail },
                    { id: "webhook", label: "Link per i portali", icon: Link2 },
                  ] as const
                ).map((voce) => {
                  const Icona = voce.icon;
                  const attiva = portalTab === voce.id;
                  return (
                    <button
                      key={voce.id}
                      type="button"
                      role="tab"
                      aria-selected={attiva}
                      onClick={() => setPortalTab(voce.id)}
                      className={cn(
                        "inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors duration-200 sm:mouse:h-9",
                        attiva
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <Icona className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{voce.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="p-3">
                {portalTab === "email" ? (
                  config.inboundEmail ? (
                    <>
                      <p className="flex items-start gap-1.5 text-sm leading-relaxed text-muted-foreground">
                        <span className="min-w-0">
                          Inoltra a questo indirizzo le email dei portali.
                        </span>
                        <InfoTip label="Nella casella dell'agenzia crea una regola di inoltro automatico verso questo indirizzo, filtrando sul mittente del portale. L'assistente legge il lead e scrive subito al cliente su WhatsApp." />
                      </p>
                      <code className="mt-2 block truncate rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                        {config.inboundEmail}
                      </code>
                      <button
                        type="button"
                        onClick={copyInboundEmail}
                        className="btn-brand mt-3 w-full text-xs sm:w-auto"
                      >
                        {emailCopied ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Clipboard className="h-4 w-4" />
                        )}
                        {emailCopied ? "Copiato!" : "Copia indirizzo"}
                      </button>
                    </>
                  ) : (
                    /* Nessun indirizzo mostrato finche' il dominio di ricezione
                       non e' configurato. Un recapito che non riceve fa perdere
                       i lead IN SILENZIO — nessun rimbalzo, nessun errore in
                       dashboard, solo contatti che non arrivano mai — ed e' gia'
                       successo con un dominio segnaposto. */
                    <>
                      <p className="flex items-start gap-1.5 text-sm leading-relaxed text-muted-foreground">
                        <span className="min-w-0">
                          L&apos;inoltro email non è ancora attivo qui. Usa il link per i portali.
                        </span>
                        <InfoTip label="Non mostriamo un recapito prima che sappia ricevere: i lead inoltrati andrebbero persi senza che tu te ne accorga." />
                      </p>
                      <button
                        type="button"
                        onClick={() => setPortalTab("webhook")}
                        className="btn-outline mt-3 w-full text-xs sm:w-auto"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Vai al link per i portali
                      </button>
                    </>
                  )
                ) : (
                  <>
                    <p className="flex items-start gap-1.5 text-sm leading-relaxed text-muted-foreground">
                      <span className="min-w-0">
                        Dai questo link al portale o al tuo gestionale.
                      </span>
                      <InfoTip label="Sui portali lo imposta il referente commerciale, come webhook delle notifiche lead in uscita. Nei gestionali (Miogest, Gestim, Realigro e simili) si incolla nella sezione «Webhook notifiche in uscita»." />
                    </p>
                    <code className="mt-2 block truncate rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                      {portalWebhookUrl}
                    </code>
                    {/* Impilati e a tutta larghezza sul telefono: affiancati
                        finivano a meta' riga ciascuno, con l'etichetta
                        troncata proprio sul verbo. */}
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                      <button
                        type="button"
                        onClick={copyPortalWebhook}
                        className="btn-brand w-full text-xs sm:w-auto"
                      >
                        {portalCopied ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Clipboard className="h-4 w-4" />
                        )}
                        {portalCopied ? "Copiato!" : "Copia indirizzo"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPortalSetup(true)}
                        className="btn-outline w-full text-xs sm:w-auto"
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                        Come si collega
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* I vocali funzionano su Meta, Twilio e QR, ma solo con un
                servizio di trascrizione configurato: senza, il cliente riceve
                la richiesta di scrivere e l'agenzia non saprebbe perché.
                Una riga sola, il resto nel tooltip: e' un'informazione di
                stato, non un'istruzione da leggere ogni volta. */}
            {provider !== "generic" && (
              <p className="flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                <Mic className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  Note vocali dei clienti:{" "}
                  {config.transcriptionReady ? (
                    <strong className="font-semibold text-foreground">attive</strong>
                  ) : (
                    <strong className="font-semibold text-status-pending">non attive</strong>
                  )}
                </span>
                <InfoTip
                  label={
                    config.transcriptionReady
                      ? "I messaggi vocali vengono trascritti e qualificati come quelli scritti."
                      : "Ai vocali l'assistente risponde chiedendo di scrivere. Scrivici per attivare la trascrizione."
                  }
                />
              </p>
            )}

            {/* Da qui in giu' e' roba del canale WhatsApp, non dei portali:
                serve a chi collega il numero a mano, una volta sola, e
                mescolarla col link da consegnare a Immobiliare.it era meta'
                del problema. Chiusa, perche' l'altra meta' era vederla. */}
            {impostazioniTecniche.length > 0 && (
              <div className="border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => setShowChannelSetup((value) => !value)}
                  aria-expanded={showChannelSetup}
                  className="flex min-h-11 md:mouse:min-h-0 items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground"
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                      showChannelSetup && "rotate-180"
                    )}
                  />
                  Impostazioni tecniche del canale
                </button>

                {showChannelSetup && (
                  <div className="mt-3 space-y-3">
                    {impostazioniTecniche.map((campo) => (
                      <CopyableField
                        key={campo.label}
                        label={campo.label}
                        value={campo.value}
                        icon={campo.icon}
                      />
                    ))}
                    {provider === "generic" && (
                      <p className="text-xs text-muted-foreground">
                        Il tuo relay inoltra qui i messaggi in arrivo, con il token come Bearer
                        oppure in coda all&apos;indirizzo.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
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
