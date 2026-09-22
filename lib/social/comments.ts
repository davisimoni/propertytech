import "server-only";
import { credenzialiMeta, getMetaAppSecret, urlGraph } from "@/lib/social/meta";

/**
 * Commenti dei post Instagram e delle Pagine Facebook: lettura, risposta,
 * moderazione.
 *
 * # Perché un modulo solo per due piattaforme
 *
 * Perché per l'agente è lo stesso gesto — qualcuno ha scritto sotto un mio
 * post, gli rispondo — e cambia solo quale endpoint di Meta lo esegue. Due
 * moduli paralleli significherebbero due volte le regole sugli errori, sul
 * token e sui permessi, e la seconda copia resta indietro alla prima modifica.
 *
 * Le differenze vere fra le due piattaforme sono tre, e stanno tutte qui:
 * l'oggetto da cui si parte (media Instagram contro post della Pagina), il
 * percorso per rispondere (`/replies` contro `/comments`) e quello per
 * nascondere (`hide` contro `is_hidden`).
 *
 * # I permessi, e perché condizionano tutto il resto
 *
 * Instagram richiede `instagram_manage_comments`. Facebook ne richiede due
 * distinti: `pages_read_user_content` per **leggere** i commenti scritti da
 * altri sotto i post della Pagina, e `pages_manage_engagement` per
 * **rispondere e nascondere** a nome della Pagina. Un token generato prima che
 * entrassero fra quelli richiesti non li porta: continua a pubblicare post ma
 * sui commenti riceve un errore. È il motivo per cui gli errori qui non
 * diventano un generico "riprova": dicono di ricollegare la Pagina, che è
 * l'unica cosa che risolve.
 *
 * # L'isolamento fra agenzie non è scritto qui, ed è voluto
 *
 * Non c'è nessun controllo "questo post è dell'agenzia X": il token **è** il
 * controllo. Ogni agenzia ha il proprio, legato al proprio account, e Meta
 * rifiuta un id che non gli appartiene. Aggiungere un confronto nostro darebbe
 * l'illusione di una seconda barriera senza aggiungerne una: l'unica fonte di
 * verità su chi possiede quel post è Meta.
 *
 * # Niente scritture in automatico
 *
 * Le risposte partono solo quando un agente preme il pulsante. Un commento
 * pubblicato resta sotto un post pubblico, a nome dell'agenzia, e non c'è modo
 * di richiamarlo prima che qualcuno lo legga.
 */

const TIMEOUT_MS = 15_000;

/** Quanti post proporre: un agente cerca il commento fra quelli recenti. */
export const MAX_POST = 12;
/** Tetto ai commenti per post. Oltre, la scheda diventa illeggibile. */
export const MAX_COMMENTI = 50;
/** Instagram rifiuta i commenti oltre questa lunghezza; Facebook è più largo. */
export const MAX_LUNGHEZZA_RISPOSTA = 2200;

export type Piattaforma = "instagram" | "facebook";

export function isPiattaforma(valore: unknown): valore is Piattaforma {
  return valore === "instagram" || valore === "facebook";
}

export type Esito<T> = { ok: true; dati: T } | { ok: false; errore: string };

export interface PostSocial {
  id: string;
  piattaforma: Piattaforma;
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

export interface CommentoSocial {
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
 * Un "OAuthException (#10)" in schermata manda l'agente a scrivere al supporto
 * per un problema che risolverebbe da solo in trenta secondi.
 */
function messaggioErrore(errore: ErroreMeta | null, status: number): string {
  const codice = errore?.code;

  if (codice === 190) {
    return "Il collegamento con Meta è scaduto. Ricollega la Pagina da Impostazioni → Integrazioni Social.";
  }
  if (codice === 10 || codice === 200 || codice === 3) {
    return "Mancano i permessi per gestire i commenti. Ricollega la Pagina da Impostazioni → Integrazioni Social e concedi anche la lettura e la gestione dei commenti.";
  }
  if (codice === 100) {
    /*
     * Il caso di gran lunga più frequente è l'elenco invecchiato: la scheda
     * resta aperta, il post o il commento viene cancellato da chi l'ha
     * scritto o dalla Pagina, e la risposta parte verso un oggetto che non
     * c'è più. Dire "aggiorna l'elenco" indica il gesto che risolve; dire
     * solo "non esiste" lasciava l'agente davanti a un elenco che continuava
     * a mostrarglielo.
     */
    return "Questo post o commento non è più disponibile: potrebbe essere stato eliminato. Aggiorna l'elenco e riprova.";
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
      /*
       * Nel log il messaggio di Meta, non solo il codice. Mai l'indirizzo:
       * quello porta il token e la prova del segreto nella query.
       *
       * Il codice 100 copre decine di casi diversi ("oggetto inesistente",
       * "operazione non supportata", "parametro non valido"), e la frase che
       * mostriamo all'agente ne sceglie uno. Senza il testo originale, una
       * segnalazione dal campo costringe a indovinare quale dei decine sia:
       * è esattamente il giro che questo difetto ci è costato. Il messaggio
       * è testo dell'API, non un dato del cliente.
       */
      console.error("[social/comments] Chiamata Graph non riuscita", {
        status: risposta.status,
        code: corpo?.error?.code ?? null,
        subcode: corpo?.error?.error_subcode ?? null,
        message: corpo?.error?.message ?? null,
      });
      return { ok: false, errore: messaggioErrore(corpo?.error ?? null, risposta.status) };
    }

    if (!corpo) {
      // Risposta 200 con corpo illeggibile: rarissima, ma trattarla come
      // successo farebbe esplodere il chiamante su un `data` inesistente.
      return { ok: false, errore: "Meta ha risposto in un formato inatteso." };
    }

    return { ok: true, dati: corpo };
  } catch (error) {
    console.error("[social/comments] Rete non disponibile", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return { ok: false, errore: messaggioErrore(null, 0) };
  }
}

interface Contesto {
  token: string;
  appSecret: string;
  /** L'oggetto da cui pendono i post: account Instagram o Pagina Facebook. */
  proprietario: string;
}

/** Token e oggetto della piattaforma richiesta, o il motivo per cui non ci sono. */
async function contesto(organizationId: string, piattaforma: Piattaforma): Promise<Esito<Contesto>> {
  const appSecret = getMetaAppSecret();
  if (!appSecret) {
    return { ok: false, errore: "Integrazione Meta non configurata su questo ambiente." };
  }

  const credenziali = await credenzialiMeta(organizationId);
  if (!credenziali.ok) return { ok: false, errore: credenziali.errore };

  if (piattaforma === "facebook") {
    // La Pagina c'è sempre: è l'oggetto su cui si fonda il collegamento.
    return {
      ok: true,
      dati: {
        token: credenziali.token,
        appSecret,
        proprietario: credenziali.connection.facebookPageId,
      },
    };
  }

  const instagramUserId = credenziali.connection.instagramUserId;
  if (!instagramUserId) {
    return {
      ok: false,
      errore:
        "Alla Pagina collegata non è associato un account Instagram professionale. Collegalo dalle impostazioni della Pagina Facebook, poi ricollega qui. I commenti Facebook restano disponibili.",
    };
  }

  return {
    ok: true,
    dati: { token: credenziali.token, appSecret, proprietario: instagramUserId },
  };
}

/** Gli ultimi post pubblicati, con quanti commenti hanno. */
export async function elencaPost(
  organizationId: string,
  piattaforma: Piattaforma
): Promise<Esito<PostSocial[]>> {
  const base = await contesto(organizationId, piattaforma);
  if (!base.ok) return base;

  const { token, appSecret, proprietario } = base.dati;

  if (piattaforma === "facebook") {
    const risposta = await chiamaGraph<{
      data?: Array<{
        id: string;
        message?: string;
        story?: string;
        full_picture?: string;
        permalink_url?: string;
        created_time?: string;
        comments?: { summary?: { total_count?: number } };
      }>;
    }>(
      // `published_posts` e non `feed`: il feed include anche i post scritti da
      // altri sulla Pagina, che non sono contenuti dell'agenzia e non hanno
      // motivo di comparire fra "i tuoi post".
      urlGraph(`${proprietario}/published_posts`, token, appSecret, {
        fields:
          "id,message,story,full_picture,permalink_url,created_time,comments.summary(total_count).limit(0)",
        limit: String(MAX_POST),
      })
    );

    if (!risposta.ok) return risposta;

    return {
      ok: true,
      dati: (risposta.dati.data ?? []).map((post) => ({
        id: post.id,
        piattaforma,
        // `story` è il testo automatico dei post senza messaggio ("ha
        // aggiornato la foto di copertina"): meglio di una riga vuota.
        didascalia: post.message ?? post.story ?? null,
        anteprima: post.full_picture ?? null,
        permalink: post.permalink_url ?? null,
        pubblicatoIl: post.created_time ?? null,
        commenti: post.comments?.summary?.total_count ?? 0,
      })),
    };
  }

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
    urlGraph(`${proprietario}/media`, token, appSecret, {
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
      piattaforma,
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
  piattaforma: Piattaforma,
  postId: string
): Promise<Esito<CommentoSocial[]>> {
  const base = await contesto(organizationId, piattaforma);
  if (!base.ok) return base;

  const { token, appSecret } = base.dati;

  if (piattaforma === "facebook") {
    const risposta = await chiamaGraph<{
      data?: Array<{
        id: string;
        message?: string;
        from?: { name?: string };
        created_time?: string;
        is_hidden?: boolean;
        comments?: {
          data?: Array<{
            id: string;
            message?: string;
            from?: { name?: string };
            created_time?: string;
          }>;
        };
      }>;
    }>(
      urlGraph(`${postId}/comments`, token, appSecret, {
        fields: "id,message,from{name},created_time,is_hidden,comments{id,message,from{name},created_time}",
        // Solo i commenti di primo livello: le risposte arrivano annidate, e
        // senza questo filtro comparirebbero anche in fondo come voci a sé.
        filter: "toplevel",
        limit: String(MAX_COMMENTI),
      })
    );

    if (!risposta.ok) return risposta;

    return {
      ok: true,
      dati: (risposta.dati.data ?? []).map((commento) => ({
        id: commento.id,
        testo: commento.message ?? "",
        // Il nome può mancare: chi commenta può non aver concesso il proprio
        // profilo all'app. Un commento senza autore resta gestibile.
        autore: commento.from?.name ?? "Utente Facebook",
        scrittoIl: commento.created_time ?? null,
        nascosto: Boolean(commento.is_hidden),
        risposte: (commento.comments?.data ?? []).map((replica) => ({
          id: replica.id,
          testo: replica.message ?? "",
          autore: replica.from?.name ?? "Utente Facebook",
          scrittoIl: replica.created_time ?? null,
        })),
      })),
    };
  }

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
    urlGraph(`${postId}/comments`, token, appSecret, {
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
  piattaforma: Piattaforma,
  commentId: string,
  messaggio: string
): Promise<Esito<{ id: string }>> {
  const base = await contesto(organizationId, piattaforma);
  if (!base.ok) return base;

  const { token, appSecret } = base.dati;

  // Instagram annida le risposte sotto `/replies`; Facebook le tratta come
  // commenti del commento. Stesso gesto, due percorsi.
  const percorso = piattaforma === "facebook" ? `${commentId}/comments` : `${commentId}/replies`;

  return chiamaGraph<{ id: string }>(
    urlGraph(percorso, token, appSecret, { message: messaggio }),
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
  piattaforma: Piattaforma,
  commentId: string,
  nascondi: boolean
): Promise<Esito<{ success?: boolean }>> {
  const base = await contesto(organizationId, piattaforma);
  if (!base.ok) return base;

  const { token, appSecret } = base.dati;
  const parametro = piattaforma === "facebook" ? "is_hidden" : "hide";

  return chiamaGraph<{ success?: boolean }>(
    urlGraph(commentId, token, appSecret, { [parametro]: String(nascondi) }),
    "POST"
  );
}
