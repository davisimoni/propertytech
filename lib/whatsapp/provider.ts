/**
 * Registro dei provider di messaggistica WhatsApp.
 *
 * Modulo client-safe (niente `server-only`, niente rete): descrive *come* si
 * chiama e si configura ciascun provider, non esegue nessuna chiamata — stesso
 * principio di `lib/integrations/providers.ts` per i gestionali, e per lo
 * stesso motivo: la scelta del provider e i suoi campi servono sia al form in
 * dashboard sia alle rotte server che poi spediscono e ricevono davvero.
 *
 * Il trasporto concreto (Meta Cloud API, Twilio, webhook generico) vive in
 * `lib/whatsapp/client.ts` (invio) e `lib/whatsapp/inbound.ts` (ricezione):
 * qui c'è solo la forma dei dati.
 */

export type WhatsAppProviderId = "meta" | "twilio" | "generic" | "qr";

export interface WhatsAppProviderMeta {
  id: WhatsAppProviderId;
  name: string;
  /** Una riga sotto al nome nel selettore. */
  tagline: string;
  /** Cosa serve procurarsi, mostrato accanto ai campi da compilare. */
  setupHint: string;
  /** URL del webhook che l'agenzia deve incollare nel pannello del provider. */
  webhookPathHint: string;
}

export const WHATSAPP_PROVIDERS: Record<WhatsAppProviderId, WhatsAppProviderMeta> = {
  qr: {
    id: "qr",
    name: "Collegamento rapido con QR",
    tagline: "Inquadri il codice col telefono, senza account sviluppatore",
    setupHint:
      "Nessuna credenziale da procurarsi: si inquadra il QR con WhatsApp dal telefono dell'agenzia, come su WhatsApp Web. Richiede il microservizio esterno configurato (WHATSAPP_SERVICE_URL).",
    // I messaggi in arrivo li recapita il microservizio a questo indirizzo,
    // non WhatsApp direttamente: il socket lo tiene aperto lui.
    webhookPathHint: "/api/whatsapp/qr/webhook",
  },
  meta: {
    id: "meta",
    name: "WhatsApp Cloud API (Meta)",
    tagline: "Collegamento diretto a Meta, nessun intermediario",
    setupHint:
      "Da Meta for Developers copia il token di accesso permanente e il Phone Number ID della tua app WhatsApp Business.",
    webhookPathHint: "/api/whatsapp/webhook",
  },
  twilio: {
    id: "twilio",
    name: "Twilio",
    tagline: "Instrada WhatsApp tramite il tuo account Twilio",
    setupHint:
      "Dalla Console Twilio copia Account SID e Auth Token, e il numero WhatsApp del Sender (formato whatsapp:+1415…). Nel Sandbox/Sender configura questo indirizzo come webhook \"When a message comes in\".",
    webhookPathHint: "/api/whatsapp/webhook/twilio",
  },
  generic: {
    id: "generic",
    name: "Webhook generico",
    tagline: "Per BSP non elencati: un relay verso un endpoint tuo",
    setupHint:
      "Usa questo canale se il tuo fornitore WhatsApp non è Meta né Twilio diretti. Il tuo endpoint riceve { to, text } e noi riceviamo i messaggi in arrivo su un unico indirizzo, autenticato col token d'ingestione dell'agenzia.",
    webhookPathHint: "/api/whatsapp/webhook/generic",
  },
};

export const WHATSAPP_PROVIDER_IDS = Object.keys(WHATSAPP_PROVIDERS) as WhatsAppProviderId[];

export function isWhatsAppProviderId(value: unknown): value is WhatsAppProviderId {
  return typeof value === "string" && value in WHATSAPP_PROVIDERS;
}

/** Provider di riferimento, con ripiego su Meta per valori ignoti o assenti. */
export function getWhatsAppProvider(id: string | null | undefined): WhatsAppProviderMeta {
  return isWhatsAppProviderId(id) ? WHATSAPP_PROVIDERS[id] : WHATSAPP_PROVIDERS.meta;
}

/**
 * Messaggio in arrivo, normalizzato rispetto al provider di trasporto.
 *
 * È il confine fra "come Meta/Twilio/un BSP qualsiasi impacchetta un
 * messaggio" e "cosa serve al Modulo 1 per qualificare un lead": ogni route
 * di webhook traduce il proprio payload in questa forma e poi chiama
 * `handleInboundWhatsAppMessage` (lib/whatsapp/inbound.ts), che non sa e non
 * deve sapere da quale provider è arrivato il messaggio.
 */
export interface InboundWhatsAppMessage {
  /** Numero del cliente, in qualsiasi formato: viene normalizzato a valle. */
  fromPhone: string;
  /** Nome del profilo WhatsApp, se il provider lo espone. */
  profileName?: string;
  /** Testo già risolto: per l'audio è la trascrizione, non l'id del media. */
  text: string;
  /**
   * Indirizzo esatto della chat (`<id>@s.whatsapp.net` o `<id>@lid`), quando
   * il trasporto lo espone.
   *
   * Serve per rispondere: WhatsApp identifica molte conversazioni con un LID
   * anziche' col numero, e ricostruire l'indirizzo dalle cifre produce in quel
   * caso un destinatario inesistente che non fallisce e non recapita.
   */
  chatJid?: string;
  /**
   * Vero quando a scrivere e' stata l'agenzia, non il cliente.
   *
   * Arriva solo per i comandi (`!pausa`): i messaggi che l'agente scrive
   * davvero al cliente non ci vengono inoltrati.
   */
  fromAgent?: boolean;
  /**
   * Vero se il mittente e' salvato nella rubrica del telefono dell'agenzia.
   *
   * E' il segnale che distingue una persona conosciuta da una richiesta
   * arrivata da un portale: un acquirente che scrive per la prima volta dopo
   * aver visto un annuncio, per definizione, in rubrica non c'e'.
   *
   * Facoltativo: i trasporti che non lo espongono (Meta Cloud API, Twilio) e i
   * microservizi non aggiornati lo lasciano assente, e in quel caso il
   * comportamento resta quello di prima.
   */
  isKnownContact?: boolean;
}
