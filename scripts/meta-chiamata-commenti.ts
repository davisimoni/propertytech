/**
 * Chiamata reale all'endpoint dei commenti Instagram, per la telemetria
 * dell'App Review di Meta.
 *
 * # A cosa serve
 *
 * Meta non accetta in revisione un permesso che l'app non ha mai usato: la
 * dashboard mostra "Chiamate API richieste: 0 di 1" finché non registra almeno
 * una chiamata riuscita fatta **con quel permesso concesso**. Questo comando
 * la esegue con il token della Pagina già collegata, e riporta lo stato HTTP
 * reale — 200 o no.
 *
 * # Perché può fallire, e perché è giusto che fallisca
 *
 * Un token porta con sé solo i permessi concessi al consenso. Se
 * `instagram_manage_comments` non è fra quelli, `/{media}/comments` risponde
 * OAuthException e Meta **non** conta nulla. Il comando allora si ferma e dice
 * cosa manca, invece di ripiegare su una chiamata diversa che tornerebbe 200
 * senza far avanzare il contatore: un 200 sull'endpoint sbagliato è la
 * risposta peggiore, perché sembra la soluzione e fa aspettare per giorni un
 * contatore che non si muoverà.
 *
 * # Uso
 *
 *   set -a && source .env.local && set +a
 *   export NODE_OPTIONS="--conditions=react-server"   # vedi sotto
 *
 *   npx --yes tsx scripts/meta-chiamata-commenti.ts --lista
 *   npx --yes tsx scripts/meta-chiamata-commenti.ts [email | organizationId]
 *   npx --yes tsx scripts/meta-chiamata-commenti.ts --media 18113753216045756
 *   npx --yes tsx scripts/meta-chiamata-commenti.ts --media <id> --commento "Testo"
 *
 * `--media` salta la ricerca del post e interroga quello indicato.
 * `--commento` pubblica davvero un commento sotto quel post: si usa solo per
 * mostrare la scrittura nel video della revisione, e va cancellato dopo.
 *
 * `--conditions=react-server` serve perché `lib/crypto/secrets.ts` importa
 * `server-only`, che fuori da Next.js lancia. Con quella condizione il pacchetto
 * risolve al modulo vuoto e la libreria dell'app si usa com'è, invece di
 * ricopiare qui la decifratura: il confine della cifratura resta uno solo.
 *
 * # Token fornito a mano
 *
 * Se non c'è ancora nessuna Pagina collegata nell'app, si può passare un token
 * generato nel Explorer per l'API Graph:
 *
 *   export META_TEST_TOKEN="EAAG..."        # mai come argomento: finirebbe
 *   export META_TEST_IG_USER_ID="1784..."   # nella cronologia della shell
 *
 * L'id dell'account Instagram, se non indicato, viene cercato da /me/accounts.
 *
 * Solo letture: chiede i commenti di un media, non ne pubblica. Pubblicare un
 * commento di prova lo scriverebbe sotto un post vero, visibile a chiunque
 * segua l'account.
 *
 * Dei segreti non si stampa mai il valore: né il token, né `appsecret_proof`.
 * Un Page Access Token in un terminale è un token da revocare.
 */

import { createHmac } from "node:crypto";
import { prisma } from "../lib/prisma";
import { decryptSecret, isEncryptionAvailable } from "../lib/crypto/secrets";

const GRAPH_API_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/** Il permesso in revisione: è di questo che Meta deve vedere una chiamata. */
const PERMESSO = "instagram_manage_comments";

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

async function chiama(url: URL, etichetta: string): Promise<Esito> {
  const risposta = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const corpo = (await risposta.json().catch(() => null)) as Record<string, unknown> | null;
  const errore = corpo?.error as { message?: string; code?: number; error_subcode?: number } | undefined;
  const ok = risposta.ok && !errore;

  // L'URL non si stampa mai per intero: contiene token e prova del segreto.
  console.log(`  ${ok ? "✔" : "✘"} ${etichetta} → HTTP ${risposta.status}`);
  if (errore) {
    console.log(`      ${errore.message ?? "errore senza messaggio"} (code ${errore.code ?? "—"}${errore.error_subcode ? `, subcode ${errore.error_subcode}` : ""})`);
  }

  return { status: risposta.status, ok, corpo };
}

async function elencaCollegamenti(): Promise<void> {
  const collegamenti = await prisma.socialConnection.findMany({
    select: {
      facebookPageName: true,
      facebookPageId: true,
      instagramUsername: true,
      instagramUserId: true,
      connectedAt: true,
      organization: { select: { agencyName: true, users: { select: { email: true }, take: 1 } } },
    },
  });

  if (collegamenti.length === 0) {
    console.log("\nNessuna Pagina collegata. Il collegamento si fa da /social nell'app.\n");
    return;
  }

  console.log(`\n${collegamenti.length} collegamenti:\n`);
  for (const c of collegamenti) {
    console.log(`  ${c.organization.agencyName} — ${c.organization.users[0]?.email ?? "—"}`);
    console.log(`    Pagina Facebook: ${c.facebookPageName} (${c.facebookPageId})`);
    console.log(
      `    Instagram: ${c.instagramUsername ? `@${c.instagramUsername} (${c.instagramUserId})` : "non collegato alla Pagina"}`
    );
    console.log(`    collegato il: ${c.connectedAt.toISOString().slice(0, 10)}\n`);
  }
}

interface Opzioni {
  /** Email o id dell'agenzia da cui prendere il token salvato. */
  riferimento?: string;
  /** Media da interrogare, quando lo si conosce già: salta la ricerca. */
  mediaId?: string;
  /** Testo di un commento da pubblicare. Assente = nessuna scrittura. */
  commento?: string;
}

function leggiArgomenti(argv: string[]): Opzioni {
  const opzioni: Opzioni = {};
  for (let i = 0; i < argv.length; i++) {
    const voce = argv[i];
    if (voce === "--media") opzioni.mediaId = argv[++i];
    else if (voce === "--commento") opzioni.commento = argv[++i];
    else if (!voce.startsWith("--")) opzioni.riferimento = voce;
  }
  return opzioni;
}

async function main(): Promise<void> {
  const argomenti = process.argv.slice(2);

  if (argomenti[0] === "--lista" || argomenti[0] === "--list") {
    await elencaCollegamenti();
    return;
  }

  const opzioni = leggiArgomenti(argomenti);
  const riferimento = opzioni.riferimento;

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    esci("NEXT_PUBLIC_META_APP_ID o META_APP_SECRET non caricati. Serve: set -a && source .env.local && set +a");
  }
  /*
   * Token passato dall'ambiente: la via per chi deve produrre la chiamata
   * prima che l'app abbia un collegamento salvato. Si legge da variabile e non
   * da argomento perché un argomento resta nella cronologia della shell e nel
   * titolo del processo, leggibile da chiunque usi quella macchina.
   */
  const tokenManuale = process.env.META_TEST_TOKEN?.trim();

  if (tokenManuale) {
    console.log("\nToken fornito dall'ambiente (META_TEST_TOKEN)");

    // Con il media già noto non serve risalire all'account: l'endpoint dei
    // commenti sta sotto il post, e una ricerca in meno è un motivo in meno
    // per fallire prima di arrivare alla chiamata che conta.
    const igManuale = opzioni.mediaId
      ? null
      : process.env.META_TEST_IG_USER_ID?.trim() ??
        (await scopriAccountInstagram(tokenManuale, appSecret));

    if (!opzioni.mediaId && !igManuale) {
      esci(
        "Il token non porta a nessun account Instagram Business.\n" +
          "Indica il media con --media <id>, o l'account con META_TEST_IG_USER_ID."
      );
    }

    await eseguiVerifica(tokenManuale, igManuale, appId, appSecret, opzioni);
    return;
  }

  if (!isEncryptionAvailable()) {
    esci("Cifratura non disponibile (ENCRYPTION_KEY): il token salvato non è leggibile.");
  }

  const collegamento = await prisma.socialConnection.findFirst({
    where: riferimento
      ? {
          organization: {
            OR: [{ id: riferimento }, { users: { some: { email: riferimento.toLowerCase() } } }],
          },
        }
      : { instagramUserId: { not: null } },
    select: {
      accessToken: true,
      facebookPageName: true,
      instagramUserId: true,
      instagramUsername: true,
      organization: { select: { agencyName: true } },
    },
  });

  if (!collegamento) {
    esci(
      "Nessuna Pagina collegata trovata.\n" +
        "Elenco: npx --yes tsx scripts/meta-chiamata-commenti.ts --lista"
    );
  }

  if (!collegamento.instagramUserId) {
    esci(
      `La Pagina "${collegamento.facebookPageName}" non ha un account Instagram Business collegato.\n` +
        "Senza quello non esiste nessun media di cui chiedere i commenti."
    );
  }

  const token = decryptSecret(collegamento.accessToken);
  if (!token) {
    esci("Il token salvato non è decifrabile con la ENCRYPTION_KEY corrente.");
  }

  console.log(`\n${collegamento.organization.agencyName} — Pagina "${collegamento.facebookPageName}"`);
  console.log(`Instagram: @${collegamento.instagramUsername} (${collegamento.instagramUserId})\n`);

  await eseguiVerifica(token, collegamento.instagramUserId, appId, appSecret, opzioni);
}

/** L'account Instagram Business agganciato alla prima Pagina del token. */
async function scopriAccountInstagram(token: string, appSecret: string): Promise<string | null> {
  const pagine = await chiama(
    urlGraph("me/accounts", token, appSecret, {
      fields: "id,name,instagram_business_account{id,username}",
      limit: "25",
    }),
    "GET /me/accounts"
  );

  const elenco = (pagine.corpo?.data ?? []) as Array<{
    instagram_business_account?: { id: string };
  }>;

  return elenco.find((p) => p.instagram_business_account)?.instagram_business_account?.id ?? null;
}

async function eseguiVerifica(
  token: string,
  instagramUserId: string | null,
  appId: string,
  appSecret: string,
  opzioni: Opzioni = {}
): Promise<void> {
  /*
   * Primo passo: quali permessi ha davvero questo token.
   *
   * È la domanda che decide tutto il resto, e l'unica risposta che non si può
   * dedurre dal codice: i permessi li concede la persona al consenso, non li
   * dichiara l'applicazione.
   */
  console.log("Permessi del token:");
  const debug = await chiama(
    new URL(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`
    ),
    "debug_token"
  );

  const dati = (debug.corpo?.data ?? {}) as { scopes?: string[]; type?: string; app_id?: string };
  const permessi = dati.scopes ?? [];
  console.log(`      tipo: ${dati.type ?? "—"}`);
  console.log(`      app del token: ${dati.app_id ?? "—"}`);
  console.log(`      concessi: ${permessi.length ? permessi.join(", ") : "—"}`);

  /*
   * L'app a cui il token appartiene, confrontata con la nostra.
   *
   * È la causa più comune di un contatore fermo a zero pur avendo ricevuto un
   * 200: l'Explorer ricorda l'ultima app usata, e una chiamata riuscita con il
   * token di un'altra app viene registrata nella telemetria di quell'altra.
   * Dal lato di chi guarda la dashboard è indistinguibile da una chiamata mai
   * partita, ed è per questo che va detto qui e non lasciato indovinare.
   */
  if (dati.app_id && dati.app_id !== appId) {
    esci(
      `\n✘ Il token appartiene all'app ${dati.app_id}, non alla nostra (${appId}).\n\n` +
        "Le chiamate fatte con questo token contano per quell'altra app: il\n" +
        "contatore della nostra revisione resta fermo qualunque esito abbiano.\n" +
        "Nell'Explorer va riselezionata l'app corretta e rigenerato il token.\n"
    );
  }

  if (!permessi.includes(PERMESSO)) {
    esci(
      `\n✘ Il token NON ha "${PERMESSO}".\n\n` +
        `Qualunque chiamata a /{media}/comments risponderebbe OAuthException, e Meta\n` +
        `non registrerebbe nulla: il contatore resterebbe "0 di 1".\n\n` +
        `Il permesso va prima chiesto al consenso (META_SCOPES in lib/social/meta.ts)\n` +
        `e poi ricollegata la Pagina da /social, così il nuovo token lo porta con sé.\n`
    );
  }

  /*
   * Serve un media di cui chiedere i commenti: l'endpoint vive sotto un post,
   * non sull'account. Un profilo senza post non può produrre la chiamata.
   */
  let mediaId = opzioni.mediaId;

  if (!mediaId) {
    console.log("\nUltimo media pubblicato:");
    const media = await chiama(
      urlGraph(`${instagramUserId}/media`, token, appSecret, {
        fields: "id,caption,timestamp",
        limit: "1",
      }),
      "GET /{ig-user-id}/media"
    );

    const elenco = (media.corpo?.data ?? []) as Array<{ id: string; timestamp?: string }>;
    const primo = elenco[0];
    if (!primo) {
      esci(
        "\n✘ L'account Instagram non ha post pubblicati.\n" +
          "L'endpoint dei commenti vive sotto un media: senza almeno un post non c'è\n" +
          "niente da chiamare. Pubblica un post qualsiasi dall'app Instagram e riprova.\n"
      );
    }

    mediaId = primo.id;
    console.log(
      `      media ${primo.id}${primo.timestamp ? ` del ${primo.timestamp.slice(0, 10)}` : ""}`
    );
  } else {
    console.log(`\nMedia indicato: ${mediaId}`);
  }

  // La chiamata che conta: è questa che usa il permesso in revisione.
  console.log(`\nChiamata con "${PERMESSO}":`);
  const commenti = await chiama(
    urlGraph(`${mediaId}/comments`, token, appSecret, {
      fields: "id,text,timestamp,username",
      limit: "25",
    }),
    "GET /{ig-media-id}/comments"
  );

  const trovati = (commenti.corpo?.data ?? []) as unknown[];

  if (!commenti.ok) {
    esci(`\n✘ Chiamata non riuscita (HTTP ${commenti.status}). Il contatore non si muove.\n`);
  }

  console.log(`\n✔ HTTP ${commenti.status} — ${trovati.length} commenti letti.`);

  /*
   * La scrittura, solo se richiesta esplicitamente.
   *
   * Un commento pubblicato resta sotto un post vero, visibile a chiunque
   * segua l'account: non è il genere di cosa che un comando fa "anche", per
   * sicurezza, mentre ne stava facendo un'altra. Per la telemetria la lettura
   * basta; questa serve a chi deve mostrare nel video della revisione che
   * l'app scrive davvero.
   */
  if (opzioni.commento) {
    console.log(`\nPubblicazione del commento (POST, visibile pubblicamente):`);
    const url = urlGraph(`${mediaId}/comments`, token, appSecret, { message: opzioni.commento });
    const pubblicato = await fetch(url, { method: "POST", signal: AbortSignal.timeout(20_000) });
    const corpo = (await pubblicato.json().catch(() => null)) as Record<string, unknown> | null;
    const errore = corpo?.error as { message?: string; code?: number } | undefined;

    console.log(`  ${pubblicato.ok && !errore ? "✔" : "✘"} POST /{ig-media-id}/comments → HTTP ${pubblicato.status}`);
    if (errore) console.log(`      ${errore.message ?? "errore senza messaggio"} (code ${errore.code ?? "—"})`);
    else console.log(`      commento ${String(corpo?.id ?? "—")} — ricordati di cancellarlo dopo la revisione`);
  }

  console.log("\n  La chiamata è registrata nei log di Meta. Il contatore dell'App Review");
  console.log("  si aggiorna entro qualche minuto (a volte fino a 24 ore).\n");
}

main()
  .then(() => process.exit(0))
  .catch((errore) => {
    console.error("Errore:", errore instanceof Error ? errore.message : errore);
    process.exit(1);
  });
