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
  /** URL pubblico dell'immagine. Obbligatorio per Instagram. */
  imageUrl?: string | null;
  targets: PublishTarget[];
}): Promise<PublishResult[]> {
  const { organizationId, message, imageUrl, targets } = params;

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
        esiti.push(await pubblicaSuFacebook(connection.facebookPageId, token, message, imageUrl));
      } else {
        esiti.push(await pubblicaSuInstagram(connection.instagramUserId, token, message, imageUrl));
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
  imageUrl: string | null | undefined
): Promise<PublishResult> {
  // Con immagine si usa /photos, senza /feed: sono due endpoint diversi, e
  // passare `url` a /feed pubblica un link, non una foto.
  const endpoint = imageUrl ? `${GRAPH}/${pageId}/photos` : `${GRAPH}/${pageId}/feed`;
  const body = new URLSearchParams({ access_token: token });
  if (imageUrl) {
    body.set("url", imageUrl);
    body.set("caption", message);
  } else {
    body.set("message", message);
  }

  const response = await fetch(endpoint, { method: "POST", body, signal: AbortSignal.timeout(20_000) });
  const dati = (await response.json()) as { id?: string; post_id?: string; error?: { message?: string } };

  if (!response.ok) {
    return { target: "facebook", ok: false, error: dati.error?.message ?? `Meta ha risposto ${response.status}.` };
  }

  return { target: "facebook", ok: true, postId: dati.post_id ?? dati.id };
}

async function pubblicaSuInstagram(
  igUserId: string | null,
  token: string,
  caption: string,
  imageUrl: string | null | undefined
): Promise<PublishResult> {
  if (!igUserId) {
    return {
      target: "instagram",
      ok: false,
      error: "Nessun profilo Instagram Business collegato alla Pagina Facebook.",
    };
  }

  if (!imageUrl) {
    // Detto come limite dell'API e non come nostro difetto: chi legge deve
    // sapere che aggiungendo una foto funziona.
    return {
      target: "instagram",
      ok: false,
      error: "Instagram richiede un'immagine: un post di solo testo non è pubblicabile.",
    };
  }

  // Due passaggi obbligatori: si crea un contenitore, poi lo si pubblica.
  // Instagram non ha una chiamata unica.
  const creazione = await fetch(`${GRAPH}/${igUserId}/media`, {
    method: "POST",
    body: new URLSearchParams({ image_url: imageUrl, caption, access_token: token }),
    signal: AbortSignal.timeout(20_000),
  });
  const contenitore = (await creazione.json()) as { id?: string; error?: { message?: string } };

  if (!creazione.ok || !contenitore.id) {
    return {
      target: "instagram",
      ok: false,
      error: contenitore.error?.message ?? `Meta ha risposto ${creazione.status}.`,
    };
  }

  const pubblicazione = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
    method: "POST",
    body: new URLSearchParams({ creation_id: contenitore.id, access_token: token }),
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
