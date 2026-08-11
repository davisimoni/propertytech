/**
 * Registro dei gestionali immobiliari collegabili.
 *
 * Modulo puro: nessun database, nessuna rete. Descrive *come* parla ciascun
 * gestionale, non esegue la chiamata — così la mappatura dei campi si può
 * verificare senza un endpoint vero davanti.
 *
 * ONESTÀ SUI PRESET, ed è la cosa più importante di questo file.
 *
 * Fra un gestionale e l'altro cambiano solo tre cose: lo schema di
 * autenticazione, i nomi dei campi e l'endpoint. Sono dati, non codice, ed è
 * per questo che sono descritti qui in forma dichiarativa.
 *
 * I preset con `verified: false` precompilano schema e mappatura secondo le
 * convenzioni italiane più diffuse, ma **non sono contratti API confermati**:
 * l'endpoint e la chiave li rilascia il fornitore all'agenzia (è così che
 * funzionano questi prodotti, venduti con provisioning per cliente), e la
 * mappatura va confrontata con la loro documentazione. Per questo la mappatura
 * è **visibile e modificabile** nella UI e c'è un test di connessione: un
 * preset sbagliato si scopre in cinque secondi al momento della configurazione,
 * non alle otto di sera al primo lead vero.
 *
 * Non inventare qui URL di endpoint: un connettore che sembra configurato e non
 * consegna è peggio di un connettore assente, perché nessuno va a controllare.
 */

/** Campi del lead che possiamo consegnare a un gestionale. */
export type LeadFieldKey =
  | "nome"
  | "telefono"
  | "fonte"
  | "immobile"
  | "stato"
  | "budget"
  | "mutuo"
  | "deveVenderePrima"
  | "tempistica"
  | "appuntamento"
  | "appuntamentoConfermato"
  | "immobiliPosseduti"
  | "categoriaVenditore"
  | "creatoIl";

/** Etichette mostrate nell'editor di mappatura, nella lingua dell'agente. */
export const LEAD_FIELD_LABELS: Record<LeadFieldKey, string> = {
  nome: "Nome del contatto",
  telefono: "Telefono",
  fonte: "Portale di provenienza",
  immobile: "Riferimento immobile",
  stato: "Stato di qualificazione",
  budget: "Budget dichiarato",
  mutuo: "Mutuo già deliberato",
  deveVenderePrima: "Ha un immobile da vendere",
  tempistica: "Tempistica d'acquisto",
  appuntamento: "Data appuntamento",
  appuntamentoConfermato: "Appuntamento confermato",
  immobiliPosseduti: "Immobili posseduti",
  categoriaVenditore: "Categoria venditore",
  creatoIl: "Data di arrivo",
};

export const LEAD_FIELD_KEYS = Object.keys(LEAD_FIELD_LABELS) as LeadFieldKey[];

/** Come il gestionale autentica la nostra chiamata. */
export type AuthScheme =
  /** Firma HMAC-SHA256 del corpo, header `X-PropertyTech-Signature`. */
  | "hmac"
  /** `Authorization: Bearer <chiave>`. */
  | "bearer"
  /** Chiave in un header proprio, es. `X-Api-Key`. */
  | "api_key_header"
  /** `Authorization: Basic base64(utente:chiave)`. */
  | "basic"
  /** Nessuna: l'URL stesso è il segreto (Zapier, Make). */
  | "url_secret";

export const AUTH_SCHEME_LABELS: Record<AuthScheme, string> = {
  hmac: "Firma HMAC-SHA256",
  bearer: "Token Bearer",
  api_key_header: "Chiave API in header",
  basic: "Autenticazione Basic",
  url_secret: "Nessuna (l'URL è il segreto)",
};

export type CrmProviderId =
  | "webhook"
  | "zapier"
  | "make"
  | "getrix"
  | "gestim"
  | "frimm"
  | "realgest"
  | "miogest"
  | "custom";

export interface CrmProvider {
  id: CrmProviderId;
  name: string;
  /** Una riga sotto al nome nel menu: aiuta a scegliere senza aprire la guida. */
  tagline: string;
  auth: AuthScheme;
  /** Header della chiave, per `api_key_header`. */
  authHeaderName?: string;
  /**
   * Host ammessi per l'endpoint. Quando il servizio ha un dominio noto, fissarlo
   * evita che un errore di battitura mandi i dati dei clienti a un host
   * qualsiasi. `null` = qualsiasi host pubblico (validato comunque da safe-url).
   */
  allowedHosts: string[] | null;
  /**
   * Il corpo è annidato sotto `lead` (la nostra forma storica) oppure piatto.
   * Zapier e Make leggono molto meglio i corpi piatti.
   */
  bodyShape: "nested" | "flat";
  /** Nome del campo di destinazione per ciascun campo nostro. */
  fieldMap: Record<LeadFieldKey, string>;
  /**
   * `true` solo quando il contratto è realmente noto e verificabile da noi.
   * Guida il badge nella UI: l'agente deve sapere cosa sta configurando.
   */
  verified: boolean;
  /** Cosa serve procurarsi, e dove. Mostrato accanto ai campi da compilare. */
  setupHint: string;
}

/** Mappatura in italiano, convenzione più diffusa fra i gestionali nostrani. */
const ITALIAN_FIELD_MAP: Record<LeadFieldKey, string> = {
  nome: "nominativo",
  telefono: "telefono",
  fonte: "provenienza",
  immobile: "riferimento",
  stato: "stato",
  budget: "budget",
  mutuo: "mutuo",
  deveVenderePrima: "immobile_da_vendere",
  tempistica: "tempistica",
  appuntamento: "appuntamento",
  appuntamentoConfermato: "appuntamento_confermato",
  immobiliPosseduti: "immobili_posseduti",
  categoriaVenditore: "categoria",
  creatoIl: "data_contatto",
};

/** Mappatura della nostra forma storica: non va cambiata, ci sono integrazioni attive. */
const NATIVE_FIELD_MAP: Record<LeadFieldKey, string> = {
  nome: "nome",
  telefono: "telefono",
  fonte: "fonte",
  immobile: "immobile",
  stato: "stato",
  budget: "budget",
  mutuo: "mutuoDeliberato",
  deveVenderePrima: "deveVenderePrima",
  tempistica: "tempistica",
  appuntamento: "appuntamento",
  appuntamentoConfermato: "appuntamentoConfermato",
  immobiliPosseduti: "immobiliPosseduti",
  categoriaVenditore: "categoriaVenditore",
  creatoIl: "creatoIl",
};

export const CRM_PROVIDERS: Record<CrmProviderId, CrmProvider> = {
  webhook: {
    id: "webhook",
    name: "Webhook PropertyTech",
    tagline: "Endpoint tuo o del tuo sviluppatore, con firma HMAC",
    auth: "hmac",
    allowedHosts: null,
    bodyShape: "nested",
    fieldMap: NATIVE_FIELD_MAP,
    verified: true,
    setupHint:
      "Incolla l'URL che riceve i lead. Generiamo un segreto con cui firmiamo ogni corpo: verificalo lato tuo per essere certo che la chiamata arrivi da noi.",
  },
  zapier: {
    id: "zapier",
    name: "Zapier",
    tagline: "Collega qualsiasi gestionale senza scrivere codice",
    auth: "url_secret",
    // L'URL di un catch hook è già il segreto: bloccare l'host impedisce che
    // un incollaggio sbagliato spedisca i lead altrove.
    allowedHosts: ["hooks.zapier.com"],
    bodyShape: "flat",
    fieldMap: NATIVE_FIELD_MAP,
    verified: true,
    setupHint:
      'In Zapier crea uno Zap con trigger "Webhooks by Zapier → Catch Hook" e incolla qui l\'URL che ti mostra.',
  },
  make: {
    id: "make",
    name: "Make (Integromat)",
    tagline: "Alternativa a Zapier, spesso più economica",
    auth: "url_secret",
    allowedHosts: ["hook.eu1.make.com", "hook.eu2.make.com", "hook.us1.make.com", "hook.make.com"],
    bodyShape: "flat",
    fieldMap: NATIVE_FIELD_MAP,
    verified: true,
    setupHint:
      'In Make crea uno scenario con modulo "Webhooks → Custom webhook" e incolla qui l\'indirizzo generato. Scegli un nodo europeo per restare in UE.',
  },
  getrix: {
    id: "getrix",
    name: "Getrix",
    tagline: "Gestionale di Immobiliare.it",
    auth: "bearer",
    allowedHosts: null,
    bodyShape: "flat",
    fieldMap: ITALIAN_FIELD_MAP,
    verified: false,
    setupHint:
      "Chiedi a Getrix l'endpoint di importazione lead e il token API della tua agenzia. Confronta poi la mappatura qui sotto con i nomi dei campi della loro documentazione.",
  },
  gestim: {
    id: "gestim",
    name: "Gestim",
    tagline: "Gestionale immobiliare italiano",
    auth: "api_key_header",
    authHeaderName: "X-Api-Key",
    allowedHosts: null,
    bodyShape: "flat",
    fieldMap: ITALIAN_FIELD_MAP,
    verified: false,
    setupHint:
      "Chiedi a Gestim l'endpoint di importazione e la chiave API della tua agenzia. Verifica con loro il nome esatto dell'header della chiave e dei campi.",
  },
  frimm: {
    id: "frimm",
    name: "Frimm",
    tagline: "Network MLS e gestionale",
    auth: "api_key_header",
    authHeaderName: "X-Api-Key",
    allowedHosts: null,
    bodyShape: "flat",
    fieldMap: ITALIAN_FIELD_MAP,
    verified: false,
    setupHint:
      "Chiedi a Frimm l'endpoint e le credenziali API della tua agenzia, poi allinea la mappatura ai nomi dei loro campi.",
  },
  realgest: {
    id: "realgest",
    name: "RealGest",
    tagline: "Gestionale immobiliare",
    auth: "bearer",
    allowedHosts: null,
    bodyShape: "flat",
    fieldMap: ITALIAN_FIELD_MAP,
    verified: false,
    setupHint:
      "Preset non confermato: non abbiamo un contratto API verificato per RealGest. Chiedi al fornitore l'endpoint di importazione lead (ed eventualmente quello di lettura annunci) e il token della tua agenzia, poi allinea qui sotto la mappatura ai nomi dei loro campi. Verifica sempre con \"Invia lead di prova\" prima di andare in produzione.",
  },
  miogest: {
    id: "miogest",
    name: "Miogest",
    tagline: "Gestionale immobiliare",
    auth: "bearer",
    allowedHosts: null,
    bodyShape: "flat",
    fieldMap: ITALIAN_FIELD_MAP,
    verified: false,
    setupHint:
      "Preset non confermato: non abbiamo un contratto API verificato per Miogest. Chiedi al fornitore l'endpoint di importazione lead (ed eventualmente quello di lettura annunci) e il token della tua agenzia, poi allinea qui sotto la mappatura ai nomi dei loro campi. Verifica sempre con \"Invia lead di prova\" prima di andare in produzione.",
  },
  custom: {
    id: "custom",
    name: "Altro gestionale",
    tagline: "Configura endpoint, autenticazione e campi a mano",
    auth: "bearer",
    allowedHosts: null,
    bodyShape: "flat",
    fieldMap: ITALIAN_FIELD_MAP,
    verified: false,
    setupHint:
      "Serve la documentazione API del tuo gestionale: endpoint, tipo di autenticazione e nomi dei campi. Il tuo fornitore te li fornisce su richiesta.",
  },
};

export const CRM_PROVIDER_IDS = Object.keys(CRM_PROVIDERS) as CrmProviderId[];

export function isCrmProviderId(value: unknown): value is CrmProviderId {
  return typeof value === "string" && value in CRM_PROVIDERS;
}

/** Provider di riferimento, con ripiego sul webhook generico per valori ignoti. */
export function getProvider(id: string | null | undefined): CrmProvider {
  return isCrmProviderId(id) ? CRM_PROVIDERS[id] : CRM_PROVIDERS.webhook;
}

/** Vero quando il provider richiede una credenziale oltre all'URL. */
export function needsCredential(provider: CrmProvider): boolean {
  return provider.auth === "bearer" || provider.auth === "api_key_header" || provider.auth === "basic";
}

/**
 * Verifica che l'host dell'endpoint sia fra quelli ammessi dal provider.
 *
 * Il confronto è sull'host esatto o su un sottodominio: `hooks.zapier.com` vale
 * anche per `eu.hooks.zapier.com`, ma non per `hooks.zapier.com.evil.test` —
 * che è precisamente il trucco che un controllo con `endsWith` sulla stringa
 * intera lascerebbe passare.
 */
export function isHostAllowed(provider: CrmProvider, hostname: string): boolean {
  if (provider.allowedHosts === null) return true;

  const host = hostname.toLowerCase();
  return provider.allowedHosts.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`)
  );
}

/** Valori grezzi del lead, prima della mappatura sui nomi del gestionale. */
export interface LeadValues {
  nome: string;
  telefono: string;
  fonte: string;
  immobile: string;
  stato: string;
  budget: string | null;
  mutuo: boolean | null;
  deveVenderePrima: boolean | null;
  tempistica: string | null;
  appuntamento: string | null;
  appuntamentoConfermato: boolean | null;
  immobiliPosseduti: number | null;
  categoriaVenditore: string | null;
  creatoIl: string;
}

/**
 * Applica la mappatura, producendo il corpo che il gestionale si aspetta.
 *
 * Una destinazione vuota esclude il campo: è il modo in cui l'agenzia dice
 * "questo campo il mio gestionale non ce l'ha" senza doverlo ricevere come
 * `null` e vederselo rifiutare.
 */
export function mapLeadFields(
  values: LeadValues,
  fieldMap: Record<LeadFieldKey, string>
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};

  for (const key of LEAD_FIELD_KEYS) {
    const target = fieldMap[key]?.trim();
    if (!target) continue;
    mapped[target] = values[key];
  }

  return mapped;
}

/**
 * Fonde una mappatura salvata con quella del provider.
 *
 * Le chiavi ignote vengono scartate e quelle mancanti prendono il valore del
 * preset: così l'aggiunta di un campo nuovo non lascia le integrazioni già
 * configurate con un buco, e una mappatura manomessa non può iniettare campi
 * arbitrari nel corpo.
 */
export function resolveFieldMap(
  provider: CrmProvider,
  saved: unknown
): Record<LeadFieldKey, string> {
  const resolved = { ...provider.fieldMap };
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return resolved;

  const candidate = saved as Record<string, unknown>;

  for (const key of LEAD_FIELD_KEYS) {
    const value = candidate[key];
    if (typeof value === "string") resolved[key] = value.trim();
  }

  return resolved;
}
