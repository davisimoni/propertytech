import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { readSecret } from "@/lib/env";
import { decryptSecret, encryptSecret, isEncryptionAvailable } from "@/lib/crypto/secrets";
import { SITE_URL } from "@/lib/seo";

/**
 * Collegamento e pubblicazione su Pagina Facebook e Instagram Business.
 *
 * # Cosa serve perché funzioni davvero, detto prima
 *
 * Non basta il codice. Meta richiede un'app approvata con i permessi
 * `pages_show_list`, `pages_manage_posts`, `pages_read_engagement` e
 * `instagram_content_publish`, e questi ultimi due passano da **App Review**:
 * finché l'app è in modalità sviluppo funziona solo con gli account elencati
 * come tester. È una revisione che Meta fa a mano e richiede giorni.
 *
 * Finché le credenziali mancano, ogni rotta risponde con un messaggio che dice
 * cosa manca invece di fallire in silenzio — stesso principio del seam STT in
 * `lib/ai/transcription.ts` e dei connettori gestionale non verificati.
 *
 * # Il vincolo di Instagram che sorprende sempre
 *
 * **Su Instagram non si pubblica testo.** L'API accetta solo contenuti con
 * un'immagine o un video, e quel media deve stare a un **URL pubblico** che i
 * server di Meta possano scaricare: non si carica un file, si passa un
 * indirizzo. Un post Instagram senza immagine non è una funzione mancante, è
 * una cosa che l'API non permette, e l'interfaccia deve dirlo prima che
 * qualcuno prepari una didascalia per niente.
 *
 * Su Facebook invece il testo da solo si pubblica.
 */

const GRAPH_API_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Permessi richiesti al consenso. Meno di questi e la pubblicazione non parte.
 *
 * `business_management` serve alle Pagine possedute da un Portfolio Business
 * (Business Manager): senza, `/me/accounts` può restituire un elenco vuoto
 * anche a chi ha il controllo completo della Pagina, e `/me/businesses` non
 * è leggibile. Per gli utenti senza un ruolo sull'app Meta richiede l'accesso
 * avanzato (App Review), come gli altri permessi della pubblicazione.
 */
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
].join(",");

export function getMetaAppId(): string | null {
  return readSecret("NEXT_PUBLIC_META_APP_ID") ?? null;
}

export function getMetaAppSecret(): string | null {
  return readSecret("META_APP_SECRET") ?? null;
}

/** Vero se l'app Meta è configurata: senza, non si può nemmeno cominciare. */
export function isMetaConfigured(): boolean {
  return Boolean(getMetaAppId() && getMetaAppSecret());
}

/**
 * `organizationId.firma` — dice al callback di chi e' la Pagina.
 *
 * Firmato e non in chiaro: se fosse il solo id, chiunque potrebbe completare
 * un consenso con l'id di un'altra agenzia scritto a mano e agganciarle la
 * propria Pagina, o agganciare a se' quella di qualcun altro.
 *
 * Vive qui e non nella rotta perche' un file di rotta Next puo' esportare solo
 * i metodi HTTP: esportare altro da li' fa fallire il build, e la verifica al
 * ritorno ha comunque bisogno della stessa funzione.
 */
export function signOAuthState(organizationId: string): string {
  const secret = getMetaAppSecret() ?? "";
  const firma = createHmac("sha256", secret).update(organizationId).digest("hex");
  return `${organizationId}.${firma}`;
}

/**
 * Verifica la firma ed estrae l'organizzazione. `null` se non torna.
 *
 * Confronto a tempo costante: su una firma HMAC un confronto normale esce al
 * primo byte diverso, e da quanto ci mette si puo' ricostruire il valore
 * giusto un carattere alla volta.
 */
export function verifyOAuthState(state: string): string | null {
  const [organizationId, firma] = state.split(".");
  if (!organizationId || !firma) return null;

  const secret = getMetaAppSecret();
  if (!secret) return null;

  const attesa = createHmac("sha256", secret).update(organizationId).digest("hex");
  const a = Buffer.from(firma, "hex");
  const b = Buffer.from(attesa, "hex");
  if (a.length !== b.length) return null;

  return timingSafeEqual(a, b) ? organizationId : null;
}

export const META_REDIRECT_PATH = "/api/social/meta/callback";

export function buildMetaAuthUrl(state: string): string | null {
  const appId = getMetaAppId();
  if (!appId) return null;

  const url = new URL(`https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", `${SITE_URL}${META_REDIRECT_PATH}`);
  url.searchParams.set("scope", META_SCOPES);
  url.searchParams.set("response_type", "code");
  // Ripropone i permessi rifiutati in un consenso precedente: senza, Meta
  // ricorda il rifiuto e il nuovo tentativo fallisce allo stesso modo.
  url.searchParams.set("auth_type", "rerequest");
  // `state` lega il ritorno all'agenzia che ha aperto il consenso: senza,
  // chiunque potrebbe far atterrare un callback su un'altra organizzazione.
  url.searchParams.set("state", state);
  return url.toString();
}

export interface MetaPageConnection {
  facebookPageId: string;
  facebookPageName: string;
  instagramUserId: string | null;
  instagramUsername: string | null;
  accessToken: string;
  /**
   * Utente Facebook che ha autorizzato il collegamento.
   *
   * Serve alla cancellazione dati richiesta da Meta: quella callback arriva
   * con l'id dell'utente, e senza averlo registrato non si saprebbe quale
   * collegamento eliminare (`lib/social/data-deletion.ts`).
   */
  facebookUserId: string | null;
}

/**
 * Esito del collegamento, con il motivo quando non riesce.
 *
 * Prima ogni fallimento diventava "Nessuna Pagina Facebook trovata", anche
 * quando a fallire era lo scambio del codice: il messaggio mandava a cercare
 * il problema nella Pagina quando stava altrove.
 */
export type EsitoCollegamentoMeta =
  | { ok: true; page: MetaPageConnection }
  | {
      ok: false;
      motivo: "scambio_codice" | "lettura_pagine" | "nessuna_pagina" | "permessi_mancanti";
    };

interface PaginaMeta {
  id: string;
  name: string;
  access_token?: string;
  tasks?: string[];
  instagram_business_account?: { id: string; username?: string };
}

interface ErroreMeta {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

interface RispostaGraph<T> {
  ok: boolean;
  status: number;
  dati: T | null;
  errore: ErroreMeta | null;
}

const CAMPI_PAGINA = "id,name,access_token,tasks,instagram_business_account{id,username}";
/** Tetto ai giri di paginazione: nessuna agenzia amministra migliaia di Pagine. */
const MAX_PAGINE_RISULTATI = 10;
const MAX_BUSINESS = 10;
const MAX_PAGINE_BUSINESS = 25;

/**
 * `appsecret_proof`: HMAC del token con il segreto dell'app.
 *
 * Se nelle impostazioni dell'app Meta è attivo "Require App Secret", le
 * chiamate senza questa prova vengono rifiutate; se non lo è, la prova è
 * ignorata. Inviarla sempre rende il codice indipendente da quell'impostazione
 * e impedisce di usare un token sottratto da un'altra app.
 */
function appSecretProof(token: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(token).digest("hex");
}

async function graphGet<T>(url: URL | string): Promise<RispostaGraph<T>> {
  try {
    const risposta = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const corpo = (await risposta.json().catch(() => null)) as (T & { error?: ErroreMeta }) | null;
    return {
      ok: risposta.ok && !corpo?.error,
      status: risposta.status,
      dati: corpo,
      errore: corpo?.error ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      dati: null,
      errore: { message: error instanceof Error ? error.message : "errore di rete" },
    };
  }
}

function urlGraph(
  percorso: string,
  token: string,
  appSecret: string,
  parametri: Record<string, string> = {}
): URL {
  const url = new URL(`${GRAPH}/${percorso}`);
  for (const [chiave, valore] of Object.entries(parametri)) url.searchParams.set(chiave, valore);
  url.searchParams.set("access_token", token);
  url.searchParams.set("appsecret_proof", appSecretProof(token, appSecret));
  return url;
}

function conProva(indirizzo: string | null, appSecret: string): string | null {
  if (!indirizzo) return null;
  const url = new URL(indirizzo);
  const token = url.searchParams.get("access_token");
  if (token && !url.searchParams.has("appsecret_proof")) {
    url.searchParams.set("appsecret_proof", appSecretProof(token, appSecret));
  }
  return url.toString();
}

/** Tutti i risultati di un elenco Graph, seguendo `paging.next`. */
async function elencoCompleto<T>(
  primo: URL,
  appSecret: string
): Promise<{ elementi: T[]; status: number; errore: ErroreMeta | null }> {
  const elementi: T[] = [];
  let prossimo: string | null = primo.toString();
  let status = 0;

  for (let giro = 0; prossimo && giro < MAX_PAGINE_RISULTATI; giro++) {
    const risposta: RispostaGraph<{ data?: T[]; paging?: { next?: string } }> =
      await graphGet(prossimo);
    status = risposta.status;
    if (!risposta.ok) return { elementi, status, errore: risposta.errore };
    elementi.push(...(risposta.dati?.data ?? []));
    // `paging.next` porta già token e parametri della richiesta originale;
    // la prova del segreto si ricalcola se Meta non la riporta.
    prossimo = conProva(risposta.dati?.paging?.next ?? null, appSecret);
  }

  return { elementi, status, errore: null };
}

/**
 * Una Pagina è collegabile se ha il proprio token e permette di pubblicare.
 *
 * `tasks` assente è accettato: non tutte le risposte lo includono, e
 * scartare la Pagina per un campo mancante sarebbe peggio che provarci.
 */
function collegabile(pagina: PaginaMeta): boolean {
  if (!pagina.access_token) return false;
  return !pagina.tasks || pagina.tasks.includes("CREATE_CONTENT") || pagina.tasks.includes("MANAGE");
}

/**
 * Riepilogo di una Pagina per i log: MAI il token.
 *
 * Un Page Access Token nei log di Vercel permetterebbe a chiunque li legga di
 * pubblicare a nome dell'agenzia. Si registra solo se c'era.
 */
function perLog(pagina: PaginaMeta) {
  return {
    id: pagina.id,
    nome: pagina.name,
    tasks: pagina.tasks ?? null,
    token: Boolean(pagina.access_token),
    instagram: Boolean(pagina.instagram_business_account),
  };
}

/**
 * Pagine di un Portfolio Business, quando `/me/accounts` non le restituisce.
 *
 * Una Pagina posseduta da un Portfolio Business (Business Manager) spesso non
 * compare in `/me/accounts` anche se la persona la gestisce: la si legge dal
 * Business (`owned_pages`, e `client_pages` per quelle di clienti), poi si
 * chiede a ciascuna il proprio token con il token dell'utente. Richiede il
 * permesso `business_management`.
 */
async function pagineDaiBusiness(
  userToken: string,
  appSecret: string
): Promise<{ pagine: PaginaMeta[]; diagnostica: Record<string, unknown> }> {
  const business = await elencoCompleto<{ id: string; name: string }>(
    urlGraph("me/businesses", userToken, appSecret, { fields: "id,name", limit: "50" }),
    appSecret
  );
  const diagnostica: Record<string, unknown> = {
    status: business.status,
    errore: business.errore,
    portfolio: business.elementi.map((b) => ({ id: b.id, nome: b.name })),
  };
  if (business.errore || business.elementi.length === 0) return { pagine: [], diagnostica };

  const trovate = new Map<string, PaginaMeta>();
  for (const b of business.elementi.slice(0, MAX_BUSINESS)) {
    for (const bordo of ["owned_pages", "client_pages"]) {
      const elenco = await elencoCompleto<PaginaMeta>(
        urlGraph(`${b.id}/${bordo}`, userToken, appSecret, {
          fields: "id,name,instagram_business_account{id,username}",
          limit: "50",
        }),
        appSecret
      );
      for (const pagina of elenco.elementi) trovate.set(pagina.id, pagina);
    }
  }

  // Il token di ogni Pagina, letto con il token dell'utente: arriva solo se
  // la persona ha un ruolo su quella Pagina nel Business.
  const pagine: PaginaMeta[] = [];
  for (const pagina of [...trovate.values()].slice(0, MAX_PAGINE_BUSINESS)) {
    const dettaglio = await graphGet<PaginaMeta>(
      urlGraph(pagina.id, userToken, appSecret, { fields: CAMPI_PAGINA })
    );
    pagine.push(dettaglio.ok && dettaglio.dati ? { ...pagina, ...dettaglio.dati } : pagina);
  }

  diagnostica.pagine = pagine.map(perLog);
  return { pagine, diagnostica };
}

/** Permessi concessi e rifiutati nel consenso, per capire cosa manca. */
async function permessiConcessi(userToken: string, appSecret: string) {
  const risposta = await graphGet<{ data?: { permission: string; status: string }[] }>(
    urlGraph("me/permissions", userToken, appSecret)
  );
  const voci = risposta.dati?.data ?? [];
  return {
    concessi: voci.filter((v) => v.status === "granted").map((v) => v.permission),
    rifiutati: voci.filter((v) => v.status !== "granted").map((v) => v.permission),
    errore: risposta.errore,
  };
}

/**
 * Pagine selezionate nel consenso (granular scopes).
 *
 * Nel dialogo Meta la persona sceglie a quali Pagine dare accesso: una Pagina
 * non spuntata non compare da nessuna parte, anche se la gestisce. `debug_token`
 * con il token dell'app dice quali id sono stati concessi per ogni permesso.
 */
async function pagineConcesseNelConsenso(userToken: string, appId: string, appSecret: string) {
  const url = new URL(`${GRAPH}/debug_token`);
  url.searchParams.set("input_token", userToken);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);
  const risposta = await graphGet<{
    data?: { granular_scopes?: { scope: string; target_ids?: string[] }[] };
  }>(url);
  return {
    perPermesso: (risposta.dati?.data?.granular_scopes ?? []).map((g) => ({
      permesso: g.scope,
      idConcessi: g.target_ids ?? "tutti",
    })),
    errore: risposta.errore,
  };
}

/**
 * Dal codice del consenso alla Pagina collegabile.
 *
 * Il codice diventa un token utente; il token utente elenca le Pagine che la
 * persona gestisce; ogni Pagina porta il PROPRIO token, che è quello con cui
 * si pubblica. Le Pagine si cercano prima in `/me/accounts` (con paginazione)
 * e, se lì non ce n'è una collegabile, nei Portfolio Business della persona.
 *
 * Se non si trova nulla si registra cosa ha risposto Meta — permessi, Pagine
 * concesse nel consenso, risultati di entrambe le ricerche — senza token.
 */
export async function exchangeCodeForPage(code: string): Promise<EsitoCollegamentoMeta> {
  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  if (!appId || !appSecret) return { ok: false, motivo: "scambio_codice" };

  const tokenUrl = new URL(`${GRAPH}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("redirect_uri", `${SITE_URL}${META_REDIRECT_PATH}`);
  tokenUrl.searchParams.set("code", code);

  const scambio = await graphGet<{ access_token?: string }>(tokenUrl);
  const userToken = scambio.dati?.access_token;
  if (!scambio.ok || !userToken) {
    console.error("[social/meta] Scambio del codice non riuscito", {
      status: scambio.status,
      errore: scambio.errore,
    });
    return { ok: false, motivo: "scambio_codice" };
  }

  // L'id dell'utente e le Pagine si chiedono insieme: il primo serve alla
  // cancellazione dati di Meta, che arriva con quello e non con la Pagina.
  const [utente, account] = await Promise.all([
    graphGet<{ id?: string }>(urlGraph("me", userToken, appSecret, { fields: "id" })),
    elencoCompleto<PaginaMeta>(
      urlGraph("me/accounts", userToken, appSecret, { fields: CAMPI_PAGINA, limit: "50" }),
      appSecret
    ),
  ]);

  let scelta = account.elementi.find(collegabile);
  let daBusiness: Awaited<ReturnType<typeof pagineDaiBusiness>> | null = null;

  if (!scelta) {
    daBusiness = await pagineDaiBusiness(userToken, appSecret);
    scelta = daBusiness.pagine.find(collegabile);
  }

  if (!scelta) {
    const [permessi, consenso] = await Promise.all([
      permessiConcessi(userToken, appSecret),
      pagineConcesseNelConsenso(userToken, appId, appSecret),
    ]);

    // Diagnostica completa di cosa ha restituito Meta, senza token.
    console.warn("[social/meta] Nessuna Pagina collegabile: risposta di Meta", {
      permessi,
      pagineConcesseNelConsenso: consenso,
      meAccounts: {
        status: account.status,
        errore: account.errore,
        pagine: account.elementi.map(perLog),
      },
      portfolioBusiness: daBusiness?.diagnostica ?? null,
    });

    if (account.errore && (!daBusiness || daBusiness.diagnostica.errore)) {
      return { ok: false, motivo: "lettura_pagine" };
    }
    const mancano = ["pages_show_list", "pages_manage_posts"].some(
      (permesso) => !permessi.concessi.includes(permesso)
    );
    return { ok: false, motivo: mancano ? "permessi_mancanti" : "nessuna_pagina" };
  }

  console.info("[social/meta] Pagina trovata", {
    origine: account.elementi.includes(scelta) ? "me/accounts" : "portfolio business",
    pagina: perLog(scelta),
    pagineViste: account.elementi.length + (daBusiness?.pagine.length ?? 0),
  });

  return {
    ok: true,
    page: {
      facebookPageId: scelta.id,
      facebookPageName: scelta.name,
      instagramUserId: scelta.instagram_business_account?.id ?? null,
      instagramUsername: scelta.instagram_business_account?.username ?? null,
      accessToken: scelta.access_token as string,
      facebookUserId: utente.dati?.id ?? null,
    },
  };
}

/** Salva il collegamento, col token cifrato. */
export async function saveConnection(
  organizationId: string,
  page: MetaPageConnection
): Promise<void> {
  if (!isEncryptionAvailable()) {
    // Meglio non collegare che salvare in chiaro un token che pubblica a nome
    // dell'agenzia: stessa regola dei token WhatsApp (CLAUDE.md §5).
    throw new Error("Cifratura non disponibile: collegamento non salvato.");
  }

  const dati = {
    facebookPageId: page.facebookPageId,
    facebookPageName: page.facebookPageName,
    instagramUserId: page.instagramUserId,
    instagramUsername: page.instagramUsername,
    accessToken: encryptSecret(page.accessToken),
    facebookUserId: page.facebookUserId,
  };

  await prisma.socialConnection.upsert({
    where: { organizationId },
    create: { organizationId, ...dati },
    update: dati,
  });
}

export interface ConnectionStatus {
  connected: boolean;
  facebookPageId: string | null;
  facebookPageName: string | null;
  instagramUsername: string | null;
  /**
   * Se il canale riceve i post quando l'agente preme "Pubblica" in /social.
   *
   * Non e' un invio che parte da solo: e' un filtro su quello manuale. `true`
   * quando non c'e' ancora un collegamento, cosi' la UI non deve distinguere
   * "non collegato" da "collegato ma disattivato" per decidere cosa mostrare
   * di default una volta che l'agenzia si collega.
   */
  facebookAutoPublish: boolean;
  instagramAutoPublish: boolean;
  /** Vero se l'app Meta è configurata: senza, il pulsante non ha senso. */
  configured: boolean;
}

export async function getConnectionStatus(organizationId: string): Promise<ConnectionStatus> {
  const connection = await prisma.socialConnection.findUnique({
    where: { organizationId },
    select: {
      facebookPageId: true,
      facebookPageName: true,
      instagramUsername: true,
      facebookAutoPublish: true,
      instagramAutoPublish: true,
    },
  });

  return {
    connected: connection !== null,
    facebookPageId: connection?.facebookPageId ?? null,
    facebookPageName: connection?.facebookPageName ?? null,
    instagramUsername: connection?.instagramUsername ?? null,
    facebookAutoPublish: connection?.facebookAutoPublish ?? true,
    instagramAutoPublish: connection?.instagramAutoPublish ?? true,
    configured: isMetaConfigured(),
  };
}

/**
 * Attiva o disattiva un canale, senza toccare l'altro.
 *
 * Restituisce `null` quando non c'e' alcun collegamento: la rotta lo traduce
 * in 404 invece di scrivere un interruttore su una riga che non esiste.
 */
export async function setAutoPublish(
  organizationId: string,
  channel: PublishTarget,
  enabled: boolean
): Promise<ConnectionStatus | null> {
  const esiste = await prisma.socialConnection.findUnique({
    where: { organizationId },
    select: { id: true },
  });
  if (!esiste) return null;

  await prisma.socialConnection.update({
    where: { organizationId },
    data: channel === "facebook" ? { facebookAutoPublish: enabled } : { instagramAutoPublish: enabled },
  });

  return getConnectionStatus(organizationId);
}

export type PublishTarget = "facebook" | "instagram";

export interface PublishResult {
  target: PublishTarget;
  ok: boolean;
  postId?: string;
  error?: string;
}

/**
 * Pubblica il testo (e l'immagine, dove serve) sui canali richiesti.
 *
 * Non lancia: restituisce un esito per canale. Facebook riuscito e Instagram
 * fallito è un risultato normale — su Instagram serve un'immagine — e
 * trattarlo come un errore unico nasconderebbe il post che è andato bene.
 */
export async function publishToMeta(params: {
  organizationId: string;
  message: string;
  /**
   * URL pubblici delle foto, in ordine: la prima e' la copertina.
   *
   * Vuoto e' ammesso solo per Facebook. Instagram rifiuta un post senza media,
   * e la ragione la spiega `pubblicaSuInstagram`.
   */
  mediaUrls?: string[];
  targets: PublishTarget[];
}): Promise<PublishResult[]> {
  const { organizationId, message, targets } = params;

  /*
   * Indirizzi resi assoluti prima di consegnarli a Meta.
   *
   * Senza object storage un allegato vive su `/api/social/media/<id>`, che e'
   * un percorso relativo: a noi basta, ma a scaricarlo sono i server di Meta,
   * che partono da fuori e non hanno un'origine da cui risolverlo.
   */
  const mediaUrls = (params.mediaUrls ?? []).map((url) =>
    url.startsWith("http") ? url : new URL(url, SITE_URL).toString()
  );

  const connection = await prisma.socialConnection.findUnique({ where: { organizationId } });
  if (!connection) {
    return targets.map((target) => ({
      target,
      ok: false,
      error: "Nessuna Pagina collegata. Collegala da Impostazioni → Integrazioni Social.",
    }));
  }

  const token = decryptSecret(connection.accessToken);
  if (!token) {
    // Token non decifrabile: chiave cambiata o valore manomesso. Si rifiuta
    // invece di provare a usarlo in chiaro.
    return targets.map((target) => ({
      target,
      ok: false,
      error: "Il collegamento non è più valido. Ricollega la Pagina dalle Impostazioni.",
    }));
  }

  const esiti: PublishResult[] = [];

  for (const target of targets) {
    /*
     * Il gate per canale si controlla qui, non prima di chiamare questa
     * funzione.
     *
     * E' l'unico punto che tutti i chiamanti attraversano, quindi e' l'unico
     * posto dove il controllo non si puo' scavalcare passando un `targets`
     * costruito a mano. Il canale disattivato riceve un esito negativo con la
     * ragione, esattamente come un token scaduto: l'agente lo vede accanto
     * agli altri risultati, non come un errore muto.
     */
    const abilitato = target === "facebook" ? connection.facebookAutoPublish : connection.instagramAutoPublish;
    if (!abilitato) {
      esiti.push({
        target,
        ok: false,
        error: `Pubblicazione su ${target === "facebook" ? "Facebook" : "Instagram"} disattivata da Impostazioni → Integrazioni.`,
      });
      continue;
    }

    try {
      if (target === "facebook") {
        esiti.push(await pubblicaSuFacebook(connection.facebookPageId, token, message, mediaUrls));
      } else {
        esiti.push(await pubblicaSuInstagram(connection.instagramUserId, token, message, mediaUrls));
      }
    } catch (error) {
      console.error("[social/meta] Pubblicazione non riuscita", { target, error });
      esiti.push({ target, ok: false, error: "Errore durante la pubblicazione." });
    }
  }

  return esiti;
}

async function pubblicaSuFacebook(
  pageId: string,
  token: string,
  message: string,
  mediaUrls: string[]
): Promise<PublishResult> {
  // Solo testo: /feed. E' l'unico canale dei due che lo consente.
  if (mediaUrls.length === 0) {
    return chiamataFacebook(`${GRAPH}/${pageId}/feed`, { access_token: token, message });
  }

  // Una foto sola: /photos con `url`. Non serve il giro in due tempi.
  const primaFoto = mediaUrls[0];
  if (mediaUrls.length === 1 && primaFoto) {
    return chiamataFacebook(`${GRAPH}/${pageId}/photos`, {
      access_token: token,
      url: primaFoto,
      caption: message,
    });
  }

  /*
   * Piu' foto: si caricano NON pubblicate, poi si compone un post solo.
   *
   * Mandarle a /photos una per una produrrebbe cinque post distinti sulla
   * Pagina invece di un album, che e' esattamente il contrario di quello che
   * l'agente si aspetta dopo aver messo in fila le foto di un appartamento.
   */
  const fbids: string[] = [];
  for (const url of mediaUrls) {
    const risposta = await fetch(`${GRAPH}/${pageId}/photos`, {
      method: "POST",
      body: new URLSearchParams({ access_token: token, url, published: "false" }),
      signal: AbortSignal.timeout(20_000),
    });
    const dati = (await risposta.json()) as { id?: string; error?: { message?: string } };

    if (!risposta.ok || !dati.id) {
      return {
        target: "facebook",
        ok: false,
        error: dati.error?.message ?? `Meta ha risposto ${risposta.status} caricando una foto.`,
      };
    }
    fbids.push(dati.id);
  }

  const body = new URLSearchParams({ access_token: token, message });
  fbids.forEach((fbid, indice) => {
    body.set(`attached_media[${indice}]`, JSON.stringify({ media_fbid: fbid }));
  });

  return chiamataFacebook(`${GRAPH}/${pageId}/feed`, body);
}

/** Una POST alla Graph API con l'esito gia' tradotto in `PublishResult`. */
async function chiamataFacebook(
  endpoint: string,
  parametri: Record<string, string> | URLSearchParams
): Promise<PublishResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    body: parametri instanceof URLSearchParams ? parametri : new URLSearchParams(parametri),
    signal: AbortSignal.timeout(20_000),
  });
  const dati = (await response.json()) as {
    id?: string;
    post_id?: string;
    error?: { message?: string };
  };

  if (!response.ok) {
    return {
      target: "facebook",
      ok: false,
      error: dati.error?.message ?? `Meta ha risposto ${response.status}.`,
    };
  }

  return { target: "facebook", ok: true, postId: dati.post_id ?? dati.id };
}

async function pubblicaSuInstagram(
  igUserId: string | null,
  token: string,
  caption: string,
  mediaUrls: string[]
): Promise<PublishResult> {
  if (!igUserId) {
    return {
      target: "instagram",
      ok: false,
      error: "Nessun profilo Instagram Business collegato alla Pagina Facebook.",
    };
  }

  if (mediaUrls.length === 0) {
    // Detto come limite dell'API e non come nostro difetto: chi legge deve
    // sapere che aggiungendo una foto funziona.
    return {
      target: "instagram",
      ok: false,
      error: "Instagram richiede almeno una foto: un post di solo testo non è pubblicabile.",
    };
  }

  let creationId: string | null;

  if (mediaUrls.length === 1) {
    // Due passaggi obbligatori: si crea un contenitore, poi lo si pubblica.
    // Instagram non ha una chiamata unica.
    creationId = await creaContenitore(igUserId, token, {
      image_url: mediaUrls[0]!,
      caption,
    });
  } else {
    /*
     * Carosello: un contenitore per foto, poi uno che li raccoglie.
     *
     * I figli si creano con `is_carousel_item`, e la didascalia sta solo sul
     * contenitore padre: metterla anche sui figli la farebbe comparire
     * ripetuta o rifiutare la chiamata.
     */
    const figli: string[] = [];
    for (const url of mediaUrls) {
      const figlio = await creaContenitore(igUserId, token, {
        image_url: url,
        is_carousel_item: "true",
      });
      if (!figlio) {
        return {
          target: "instagram",
          ok: false,
          error: "Instagram non ha accettato una delle foto del carosello.",
        };
      }
      figli.push(figlio);
    }

    creationId = await creaContenitore(igUserId, token, {
      media_type: "CAROUSEL",
      children: figli.join(","),
      caption,
    });
  }

  if (!creationId) {
    return {
      target: "instagram",
      ok: false,
      error: "Instagram non ha accettato il contenuto da pubblicare.",
    };
  }

  const pubblicazione = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
    method: "POST",
    body: new URLSearchParams({ creation_id: creationId, access_token: token }),
    signal: AbortSignal.timeout(20_000),
  });
  const risultato = (await pubblicazione.json()) as { id?: string; error?: { message?: string } };

  if (!pubblicazione.ok) {
    return {
      target: "instagram",
      ok: false,
      error: risultato.error?.message ?? `Meta ha risposto ${pubblicazione.status}.`,
    };
  }

  return { target: "instagram", ok: true, postId: risultato.id };
}

/** Crea un contenitore Instagram e ne restituisce l'id, o `null` se rifiutato. */
async function creaContenitore(
  igUserId: string,
  token: string,
  campi: Record<string, string>
): Promise<string | null> {
  const risposta = await fetch(`${GRAPH}/${igUserId}/media`, {
    method: "POST",
    body: new URLSearchParams({ ...campi, access_token: token }),
    signal: AbortSignal.timeout(20_000),
  });
  const dati = (await risposta.json()) as { id?: string; error?: { message?: string } };

  if (!risposta.ok || !dati.id) {
    console.error("[social/meta] Contenitore Instagram rifiutato", {
      stato: risposta.status,
      messaggio: dati.error?.message,
    });
    return null;
  }

  return dati.id;
}
