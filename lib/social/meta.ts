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

/** Permessi richiesti al consenso. Meno di questi e la pubblicazione non parte. */
export const META_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
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
}

/**
 * Dal codice del consenso alla Pagina collegabile.
 *
 * Tre passaggi, tutti obbligatori: il codice diventa un token utente, il token
 * utente elenca le Pagine che quella persona amministra, e ogni Pagina porta
 * il PROPRIO token — che è quello con cui si pubblica. Usare il token utente
 * per pubblicare non funziona, ed è l'errore che si scopre solo al primo post.
 */
export async function exchangeCodeForPage(code: string): Promise<MetaPageConnection | null> {
  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  if (!appId || !appSecret) return null;

  const tokenUrl = new URL(`${GRAPH}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("redirect_uri", `${SITE_URL}${META_REDIRECT_PATH}`);
  tokenUrl.searchParams.set("code", code);

  const tokenResponse = await fetch(tokenUrl, { signal: AbortSignal.timeout(15_000) });
  if (!tokenResponse.ok) {
    console.error("[social/meta] Scambio del codice non riuscito", { status: tokenResponse.status });
    return null;
  }

  const { access_token: userToken } = (await tokenResponse.json()) as { access_token?: string };
  if (!userToken) return null;

  // Le Pagine amministrate, col token di ciascuna e l'eventuale profilo
  // Instagram agganciato: si chiede tutto in una volta perche' ogni giro in
  // piu' e' un'attesa dentro un callback che l'utente sta guardando.
  const pagesUrl = new URL(`${GRAPH}/me/accounts`);
  pagesUrl.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");
  pagesUrl.searchParams.set("access_token", userToken);

  const pagesResponse = await fetch(pagesUrl, { signal: AbortSignal.timeout(15_000) });
  if (!pagesResponse.ok) {
    console.error("[social/meta] Lettura delle Pagine non riuscita", { status: pagesResponse.status });
    return null;
  }

  const dati = (await pagesResponse.json()) as {
    data?: Array<{
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string; username?: string };
    }>;
  };

  /*
   * La prima Pagina, non una scelta.
   *
   * Quasi tutte le agenzie ne amministrano una sola, e chiederle di sceglierne
   * una in un elenco di uno e' un passaggio in piu' per niente. Chi ne ha piu'
   * di una scollega e ricollega selezionando quella giusta nel consenso Meta,
   * che e' dove la scelta va fatta davvero.
   */
  const pagina = dati.data?.[0];
  if (!pagina) return null;

  return {
    facebookPageId: pagina.id,
    facebookPageName: pagina.name,
    instagramUserId: pagina.instagram_business_account?.id ?? null,
    instagramUsername: pagina.instagram_business_account?.username ?? null,
    accessToken: pagina.access_token,
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
  };

  await prisma.socialConnection.upsert({
    where: { organizationId },
    create: { organizationId, ...dati },
    update: dati,
  });
}

export interface ConnectionStatus {
  connected: boolean;
  facebookPageName: string | null;
  instagramUsername: string | null;
  /** Vero se l'app Meta è configurata: senza, il pulsante non ha senso. */
  configured: boolean;
}

export async function getConnectionStatus(organizationId: string): Promise<ConnectionStatus> {
  const connection = await prisma.socialConnection.findUnique({
    where: { organizationId },
    select: { facebookPageName: true, instagramUsername: true },
  });

  return {
    connected: connection !== null,
    facebookPageName: connection?.facebookPageName ?? null,
    instagramUsername: connection?.instagramUsername ?? null,
    configured: isMetaConfigured(),
  };
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
