/**
 * Chiamate reali sui commenti di una Pagina Facebook, per la telemetria
 * dell'App Review.
 *
 * # A cosa serve
 *
 * Meta non manda in revisione un permesso che non ha mai visto usare. Servono
 * due chiamate distinte, una per permesso, perché la telemetria è per permesso
 * e non per app:
 *
 *  - `pages_read_user_content` → GET /{post-id}/comments
 *  - `pages_manage_engagement` → POST /{comment-id}/comments (o sul post)
 *
 * Nota sul percorso: `/{page-id}/published_posts/{post-id}/comments` non
 * esiste nella Graph API. `published_posts` elenca i post; i commenti si
 * chiedono al singolo post, il cui id ha già la forma `{page-id}_{post}`.
 * Lo script fa i due passaggi in fila.
 *
 * # Perché la scrittura non parte da sola
 *
 * La lettura non tocca niente. La POST invece **pubblica un commento vero
 * sotto un post vero della Pagina**, visibile a chiunque la segua: richiede
 * `--scrivi` scritto a mano. Il testo è riconoscibile come prova tecnica, e
 * per impostazione predefinita viene **cancellato subito dopo** — la
 * telemetria resta registrata, la Pagina no. `--mantieni` lo lascia, per chi
 * deve mostrarlo in un video.
 *
 * # Uso
 *
 *   set -a && source .env.local && set +a
 *   export NODE_OPTIONS="--conditions=react-server"
 *
 *   npx --yes tsx scripts/meta-chiamata-facebook-pages.ts
 *   npx --yes tsx scripts/meta-chiamata-facebook-pages.ts --scrivi
 *   npx --yes tsx scripts/meta-chiamata-facebook-pages.ts --scrivi --mantieni
 *   npx --yes tsx scripts/meta-chiamata-facebook-pages.ts --post <post-id>
 *
 * Il token è quello della Pagina collegata (decifrato dal database) oppure
 * `META_TEST_TOKEN`, se impostato, che ha la precedenza.
 *
 * Dei segreti non si stampa mai il valore: né token né `appsecret_proof`.
 */

import { createHmac } from "node:crypto";
import { prisma } from "../lib/prisma";
import { credenzialiMeta, getMetaAppSecret } from "../lib/social/meta";

const GRAPH_API_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const PERMESSO_LETTURA = "pages_read_user_content";
const PERMESSO_SCRITTURA = "pages_manage_engagement";

/** Riconoscibile come prova tecnica: nessuno deve scambiarlo per un cliente. */
const TESTO_DI_PROVA =
  "PROVA TECNICA — verifica di integrazione PropertyTech. Questo commento viene rimosso automaticamente.";

function esci(messaggio: string, codice = 1): never {
  console.error(messaggio);
  process.exit(codice);
}

function appSecretProof(token: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(token).digest("hex");
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

interface Esito {
  status: number;
  ok: boolean;
  corpo: Record<string, unknown> | null;
}

async function chiama(
  url: URL,
  etichetta: string,
  metodo: "GET" | "POST" | "DELETE" = "GET"
): Promise<Esito> {
  const risposta = await fetch(url, {
    method: metodo,
    signal: AbortSignal.timeout(20_000),
  }).catch((errore: unknown) => {
    // Node nasconde il motivo vero dentro `cause`: senza stamparlo, un guasto
    // di rete e un token rifiutato si presentano con la stessa riga.
    const causa = errore instanceof Error && errore.cause instanceof Error ? errore.cause : null;
    esci(
      `  ✘ ${etichetta} → rete non disponibile\n` +
        `      ${errore instanceof Error ? errore.message : String(errore)}` +
        (causa ? `\n      causa: ${causa.message}` : "")
    );
  });

  const corpo = (await risposta.json().catch(() => null)) as Record<string, unknown> | null;
  const errore = corpo?.error as
    | { message?: string; code?: number; error_subcode?: number }
    | undefined;
  const ok = risposta.ok && !errore;

  // L'indirizzo non si stampa: porta token e prova del segreto nella query.
  console.log(`  ${ok ? "✔" : "✘"} ${etichetta} → HTTP ${risposta.status}`);
  if (errore) {
    console.log(
      `      ${errore.message ?? "errore senza messaggio"} (code ${errore.code ?? "—"}${
        errore.error_subcode ? `, subcode ${errore.error_subcode}` : ""
      })`
    );
  }

  return { status: risposta.status, ok, corpo };
}

interface Opzioni {
  scrivi: boolean;
  mantieni: boolean;
  post?: string;
}

function leggiArgomenti(argv: string[]): Opzioni {
  const opzioni: Opzioni = { scrivi: false, mantieni: false };

  for (let i = 0; i < argv.length; i++) {
    const voce = argv[i];
    if (!voce) continue;

    if (voce === "--scrivi") opzioni.scrivi = true;
    else if (voce === "--mantieni") opzioni.mantieni = true;
    else if (voce === "--post") {
      const valore = argv[++i];
      if (!valore) esci("L'opzione --post richiede un valore.");
      opzioni.post = valore;
    }
  }

  return opzioni;
}

/** Token e Pagina: dall'ambiente se fornito, altrimenti dal collegamento salvato. */
async function credenziali(
  appSecret: string
): Promise<{ token: string; pageId: string; origine: string }> {
  const manuale = process.env.META_TEST_TOKEN?.trim();

  const collegamento = await prisma.socialConnection.findFirst({
    select: { organizationId: true, facebookPageId: true, facebookPageName: true },
  });

  if (manuale) {
    if (!collegamento) {
      esci(
        "META_TEST_TOKEN è impostato ma non so su quale Pagina usarlo.\n" +
          "Collega la Pagina dall'app, oppure indica un post con --post <id>."
      );
    }
    return {
      token: manuale,
      pageId: collegamento.facebookPageId,
      origine: `META_TEST_TOKEN, Pagina "${collegamento.facebookPageName}"`,
    };
  }

  if (!collegamento) {
    esci(
      "Nessuna Pagina collegata e nessun META_TEST_TOKEN.\n" +
        "Collega la Pagina da Impostazioni → Integrazioni Social, oppure genera un token\n" +
        "nell'Explorer con pages_read_user_content e pages_manage_engagement e scrivilo\n" +
        "in .env.local come META_TEST_TOKEN."
    );
  }

  // Dal database, con la stessa decifratura che usa l'app: il confine della
  // cifratura resta uno solo (CLAUDE.md §5).
  const salvato = await credenzialiMeta(collegamento.organizationId);
  if (!salvato.ok) esci(`Credenziali non utilizzabili: ${salvato.errore}`);

  return {
    token: salvato.token,
    pageId: salvato.connection.facebookPageId,
    origine: `token della Pagina "${salvato.connection.facebookPageName}" dal database`,
  };
}

async function main(): Promise<void> {
  const opzioni = leggiArgomenti(process.argv.slice(2));

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = getMetaAppSecret();
  if (!appId || !appSecret) {
    esci(
      "NEXT_PUBLIC_META_APP_ID o META_APP_SECRET non caricati.\n" +
        "Serve: set -a && source .env.local && set +a"
    );
  }

  const { token, pageId, origine } = await credenziali(appSecret);
  console.log(`\nPagina ${pageId} — ${origine}`);

  /*
   * Primo passo: quali permessi ha davvero questo token, e per quale app.
   *
   * Un collegamento creato prima che i due permessi entrassero nel consenso
   * non li porta: le chiamate fallirebbero e sembrerebbe un difetto del
   * codice, mentre basta ricollegare la Pagina.
   */
  console.log("\nPermessi del token:");
  const debug = await chiama(
    new URL(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(
        `${appId}|${appSecret}`
      )}`
    ),
    "debug_token"
  );

  const dati = (debug.corpo?.data ?? {}) as { scopes?: string[]; type?: string; app_id?: string };
  const permessi = dati.scopes ?? [];

  console.log(`      tipo: ${dati.type ?? "—"}`);
  console.log(`      app del token: ${dati.app_id ?? "—"}`);
  console.log(`      concessi: ${permessi.length ? permessi.join(", ") : "—"}`);

  if (dati.app_id && dati.app_id !== appId) {
    esci(
      `\n✘ Il token appartiene all'app ${dati.app_id}, non alla nostra (${appId}).\n` +
        "Le chiamate conterebbero per quell'altra app.\n"
    );
  }

  const mancanti = [PERMESSO_LETTURA, PERMESSO_SCRITTURA].filter((p) => !permessi.includes(p));
  if (mancanti.length > 0) {
    esci(
      `\n✘ Al token mancano: ${mancanti.join(", ")}.\n\n` +
        "Il collegamento è stato creato prima che questi permessi entrassero nel consenso.\n" +
        "Ricollega la Pagina da Impostazioni → Integrazioni Social concedendo anche la\n" +
        "lettura e la gestione dei commenti, poi rilancia.\n"
    );
  }

  /* ── Il post su cui lavorare ── */

  let postId = opzioni.post;

  if (!postId) {
    console.log("\nUltimo post pubblicato:");
    const post = await chiama(
      urlGraph(`${pageId}/published_posts`, token, appSecret, {
        fields: "id,message,created_time",
        limit: "1",
      }),
      "GET /{page-id}/published_posts"
    );

    const elenco = (post.corpo?.data ?? []) as Array<{
      id: string;
      message?: string;
      created_time?: string;
    }>;
    const primo = elenco[0];

    if (!primo) {
      esci(
        "\n✘ La Pagina non ha post pubblicati.\n" +
          "I commenti vivono sotto un post: pubblicane uno e riprova.\n"
      );
    }

    postId = primo.id;
    console.log(
      `      ${primo.id}${primo.created_time ? ` del ${primo.created_time.slice(0, 10)}` : ""}`
    );
  }

  /* ── 1. pages_read_user_content: i commenti scritti da altri ── */

  console.log(`\nChiamata con "${PERMESSO_LETTURA}":`);
  const commenti = await chiama(
    urlGraph(`${postId}/comments`, token, appSecret, {
      fields: "id,message,from{name},created_time,is_hidden",
      filter: "toplevel",
      limit: "25",
    }),
    "GET /{post-id}/comments"
  );

  if (!commenti.ok) {
    esci("\n✘ Lettura non riuscita: la telemetria di questo permesso non si muove.\n");
  }

  const elencoCommenti = (commenti.corpo?.data ?? []) as Array<{
    id: string;
    message?: string;
    from?: { name?: string };
  }>;
  console.log(`      ${elencoCommenti.length} commenti letti.`);
  for (const commento of elencoCommenti.slice(0, 3)) {
    console.log(
      `      · ${commento.from?.name ?? "—"}: ${(commento.message ?? "").slice(0, 60)}`
    );
  }

  /* ── 2. pages_manage_engagement: scrivere a nome della Pagina ── */

  if (!opzioni.scrivi) {
    console.log(
      `\n"${PERMESSO_SCRITTURA}" non è stato usato: serve una scrittura vera, e una` +
        "\nscrittura vera pubblica un commento sotto un post della Pagina. Rilancia con:" +
        "\n  npx --yes tsx scripts/meta-chiamata-facebook-pages.ts --scrivi\n" +
        "\nIl commento è riconoscibile come prova e viene cancellato subito dopo" +
        "\n(--mantieni lo lascia, se ti serve per il video).\n"
    );
    return;
  }

  /*
   * Si risponde a un commento esistente, se c'è.
   *
   * Una risposta annidata è meno invasiva di un commento nuovo in cima al
   * post, e usa lo stesso permesso. Senza commenti sotto cui rispondere, si
   * commenta il post: è l'unico modo di esercitare la scrittura.
   */
  const bersaglio = elencoCommenti[0];
  const percorso = bersaglio ? `${bersaglio.id}/comments` : `${postId}/comments`;

  console.log(
    `\nChiamata con "${PERMESSO_SCRITTURA}" (${bersaglio ? "risposta a un commento" : "commento sul post"}):`
  );
  const scrittura = await chiama(
    urlGraph(percorso, token, appSecret, { message: TESTO_DI_PROVA }),
    bersaglio ? "POST /{comment-id}/comments" : "POST /{post-id}/comments",
    "POST"
  );

  if (!scrittura.ok) {
    esci("\n✘ Scrittura non riuscita: la telemetria di questo permesso non si muove.\n");
  }

  const nuovoId = String(scrittura.corpo?.id ?? "");
  console.log(`      commento ${nuovoId || "—"}`);

  if (opzioni.mantieni) {
    console.log("\n⚠ Il commento di prova resta pubblicato. Ricordati di cancellarlo.");
  } else if (nuovoId) {
    // La cancellazione usa lo stesso permesso: una chiamata in più nei log e
    // una Pagina pulita. Se fallisce lo si dice, invece di lasciar credere
    // che sia sparito.
    console.log("\nPulizia:");
    const cancellazione = await chiama(
      urlGraph(nuovoId, token, appSecret),
      "DELETE /{comment-id}",
      "DELETE"
    );

    if (!cancellazione.ok) {
      console.log(
        `\n⚠ Il commento di prova ${nuovoId} è ancora pubblicato: cancellalo a mano dalla Pagina.`
      );
    }
  }

  console.log("\n✔ Entrambe le chiamate sono nei log di Meta. Il contatore dell'App Review");
  console.log("  si aggiorna entro qualche minuto (a volte fino a 24 ore).\n");
}

main()
  .then(() => process.exit(0))
  .catch((errore) => {
    console.error("Errore:", errore instanceof Error ? errore.message : errore);
    process.exit(1);
  });
