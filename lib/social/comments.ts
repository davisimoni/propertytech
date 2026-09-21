import "server-only";
import { credenzialiMeta, getMetaAppSecret, urlGraph } from "@/lib/social/meta";

/**
 * Commenti dei post Instagram: lettura, risposta, moderazione.
 *
 * # Il permesso, e perché condiziona tutto il resto
 *
 * Ogni chiamata di questo modulo richiede `instagram_manage_comments`, che è
 * un permesso di Meta soggetto ad App Review. Un token generato prima che il
 * permesso entrasse fra quelli richiesti **non lo porta con sé**: continua a
 * pubblicare post, ma sui commenti riceve un errore. È il motivo per cui gli
 * errori qui non diventano un generico "riprova": dicono di ricollegare la
 * Pagina, che è l'unica cosa che risolve davvero.
 *
 * # L'isolamento fra agenzie non è scritto qui, ed è voluto
 *
 * Non c'è nessun controllo "questo post è dell'agenzia X": il token **è** il
 * controllo. Ogni agenzia ha il proprio, legato al proprio account Instagram,
 * e Meta rifiuta un id di media che non gli appartiene. Aggiungere un
 * confronto nostro darebbe l'illusione di una seconda barriera senza
 * aggiungerne una: l'unica fonte di verità su chi possiede quel post è Meta.
 *
 * # Niente scritture in automatico
 *
 * Le risposte partono solo quando un agente preme il pulsante. Un commento
 * pubblicato resta sotto un post pubblico, a nome dell'agenzia, e non c'è
 * modo di richiamarlo prima che qualcuno lo legga: non è il tipo di azione
 * che si affida a un modello senza che nessuno la guardi.
 */

const TIMEOUT_MS = 15_000;

/** Quanti post proporre: un agente cerca il commento fra quelli recenti. */
export const MAX_POST = 12;
/** Tetto ai commenti per post. Oltre, la scheda diventa illeggibile. */
export const MAX_COMMENTI = 50;
/** Instagram rifiuta i commenti oltre questa lunghezza. */
export const MAX_LUNGHEZZA_RISPOSTA = 2200;

export type Esito<T> = { ok: true; dati: T } | { ok: false; errore: string };

export interface PostInstagram {
  id: string;
  didascalia: string | null;
  anteprima: string | null;
  permalink: string | null;
  pubblicatoIl: string | null;
  commenti: number;
}

export interface RispostaCommento {
  id: string;
  testo: string;
  autore: string;
  scrittoIl: string | null;
}

export interface CommentoInstagram {
  id: string;
  testo: string;
  autore: string;
  scrittoIl: string | null;
  nascosto: boolean;
  risposte: RispostaCommento[];
}

interface ErroreMeta {
  message?: string;
  code?: number;
  error_subcode?: number;
}

/**
 * L'errore di Meta tradotto in una frase che dice cosa fare.
 *
 * Un "OAuthException (#10)" in schermata manda l'agente a scrivere al
 * supporto per un problema che risolverebbe da solo in trenta secondi.
 */
function messaggioErrore(errore: ErroreMeta | null, status: number): string {
  const codice = errore?.code;

  if (codice === 190) {
    return "Il collegamento con Meta è scaduto. Ricollega la Pagina da Impostazioni → Integrazioni Social.";
  }
  if (codice === 10 || codice === 200 || codice === 3) {
    return "Manca il permesso per gestire i commenti. Ricollega la Pagina da Impostazioni → Integrazioni Social e concedi anche la gestione dei commenti.";
  }
  if (codice === 100) {
    return "Il post o il commento non esiste più, oppure non appartiene all'account Instagram collegato.";
  }
  if (codice === 4 || codice === 17 || codice === 32) {
    return "Meta ha temporaneamente limitato le richieste. Riprova fra qualche minuto.";
  }
  if (status === 0) {
    return "Meta non risponde. Controlla la connessione e riprova.";
  }

  return errore?.message ?? "Meta ha rifiutato la richiesta.";
}

async function chiamaGraph<T>(url: URL, metodo: "GET" | "POST" = "GET"): Promise<Esito<T>> {
  try {
    const risposta = await fetch(url, { method: metodo, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const corpo = (await risposta.json().catch(() => null)) as (T & { error?: ErroreMeta }) | null;

    if (!risposta.ok || corpo?.error) {
      // Nel log l'indirizzo non entra mai: porta il token e la prova del
      // segreto nella query.
      console.error("[social/comments] Chiamata Graph non riuscita", {
        status: risposta.status,
        code: corpo?.error?.code ?? null,
      });
      return { ok: false, errore: messaggioErrore(corpo?.error ?? null, risposta.status) };
    }

    if (!corpo) {
      // Risposta 200 con corpo illeggibile: rarissima, ma trattarla come
      // successo farebbe esplodere il chiamante su un `data` inesistente.
      return { ok: false, errore: "Meta ha risposto in un formato inatteso." };
    }

    return { ok: true, dati: corpo as T };
  } catch (error) {
    console.error("[social/comments] Rete non disponibile", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return { ok: false, errore: messaggioErrore(null, 0) };
  }
}

/** Token e account Instagram dell'agenzia, o il motivo per cui non ci sono. */
async function contesto(
  organizationId: string
): Promise<Esito<{ token: string; appSecret: string; instagramUserId: string }>> {
  const appSecret = getMetaAppSecret();
  if (!appSecret) {
    return { ok: false, errore: "Integrazione Meta non configurata su questo ambiente." };
  }

  const credenziali = await credenzialiMeta(organizationId);
  if (!credenziali.ok) return { ok: false, errore: credenziali.errore };

  const instagramUserId = credenziali.connection.instagramUserId;
  if (!instagramUserId) {
    return {
      ok: false,
      errore:
        "Alla Pagina collegata non è associato un account Instagram professionale. Collegalo dalle impostazioni della Pagina Facebook, poi ricollega qui.",
    };
  }

  return { ok: true, dati: { token: credenziali.token, appSecret, instagramUserId } };
}

/** Gli ultimi post pubblicati, con quanti commenti hanno. */
export async function elencaPost(organizationId: string): Promise<Esito<PostInstagram[]>> {
  const base = await contesto(organizationId);
  if (!base.ok) return base;

  const { token, appSecret, instagramUserId } = base.dati;

  const risposta = await chiamaGraph<{
    data?: Array<{
      id: string;
      caption?: string;
      media_url?: string;
      thumbnail_url?: string;
      permalink?: string;
      timestamp?: string;
      comments_count?: number;
    }>;
  }>(
    urlGraph(`${instagramUserId}/media`, token, appSecret, {
      // `thumbnail_url` esiste solo sui video: per le foto vale `media_url`.
      fields: "id,caption,media_url,thumbnail_url,permalink,timestamp,comments_count",
      limit: String(MAX_POST),
    })
  );

  if (!risposta.ok) return risposta;

  return {
    ok: true,
    dati: (risposta.dati.data ?? []).map((post) => ({
      id: post.id,
      didascalia: post.caption ?? null,
      anteprima: post.thumbnail_url ?? post.media_url ?? null,
      permalink: post.permalink ?? null,
      pubblicatoIl: post.timestamp ?? null,
      commenti: post.comments_count ?? 0,
    })),
  };
}

/** I commenti di un post, con le risposte già annidate. */
export async function elencaCommenti(
  organizationId: string,
  mediaId: string
): Promise<Esito<CommentoInstagram[]>> {
  const base = await contesto(organizationId);
  if (!base.ok) return base;

  const { token, appSecret } = base.dati;

  const risposta = await chiamaGraph<{
    data?: Array<{
      id: string;
      text?: string;
      username?: string;
      timestamp?: string;
      hidden?: boolean;
      replies?: {
        data?: Array<{ id: string; text?: string; username?: string; timestamp?: string }>;
      };
    }>;
  }>(
    urlGraph(`${mediaId}/comments`, token, appSecret, {
      fields: "id,text,username,timestamp,hidden,replies{id,text,username,timestamp}",
      limit: String(MAX_COMMENTI),
    })
  );

  if (!risposta.ok) return risposta;

  return {
    ok: true,
    dati: (risposta.dati.data ?? []).map((commento) => ({
      id: commento.id,
      testo: commento.text ?? "",
      autore: commento.username ?? "utente Instagram",
      scrittoIl: commento.timestamp ?? null,
      nascosto: Boolean(commento.hidden),
      risposte: (commento.replies?.data ?? []).map((replica) => ({
        id: replica.id,
        testo: replica.text ?? "",
        autore: replica.username ?? "utente Instagram",
        scrittoIl: replica.timestamp ?? null,
      })),
    })),
  };
}

/** Pubblica la risposta sotto il commento. Da qui in poi è pubblica. */
export async function rispondiACommento(
  organizationId: string,
  commentId: string,
  messaggio: string
): Promise<Esito<{ id: string }>> {
  const base = await contesto(organizationId);
  if (!base.ok) return base;

  const { token, appSecret } = base.dati;

  return chiamaGraph<{ id: string }>(
    urlGraph(`${commentId}/replies`, token, appSecret, { message: messaggio }),
    "POST"
  );
}

/**
 * Nasconde o rimostra un commento.
 *
 * Nascondere non cancella: il commento resta visibile a chi l'ha scritto e ai
 * suoi contatti, e si può rimettere. È la reazione giusta allo spam sotto un
 * annuncio, ed è reversibile — a differenza della cancellazione, che qui non
 * esponiamo di proposito.
 */
export async function nascondiCommento(
  organizationId: string,
  commentId: string,
  nascondi: boolean
): Promise<Esito<{ success?: boolean }>> {
  const base = await contesto(organizationId);
  if (!base.ok) return base;

  const { token, appSecret } = base.dati;

  return chiamaGraph<{ success?: boolean }>(
    urlGraph(commentId, token, appSecret, { hide: String(nascondi) }),
    "POST"
  );
}
