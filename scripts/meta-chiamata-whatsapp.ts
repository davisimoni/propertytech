/**
 * Chiamate reali alla Graph API di WhatsApp, per la telemetria dell'App Review.
 *
 * # A cosa serve
 *
 * Meta non manda in revisione un permesso che non ha mai visto usare. Servono
 * due chiamate distinte, una per permesso, perché la telemetria è per permesso
 * e non per app:
 *
 *  - `whatsapp_business_management` → GET /{waba-id}/phone_numbers
 *  - `whatsapp_business_messaging`  → POST /{phone-number-id}/messages
 *
 * # Perché l'invio non parte da solo
 *
 * La prima è una lettura e non tocca nulla. La seconda **manda un messaggio
 * WhatsApp a un numero di telefono vero**, che squilla a casa di qualcuno e
 * non si annulla. Non è il genere di cosa che un comando fa "anche", mentre
 * stava facendo altro: richiede `--invia <numero>` scritto a mano da chi sa a
 * chi sta scrivendo.
 *
 * Il numero deve essere fra i destinatari di prova del WABA (o avere già
 * scritto all'azienda nelle 24 ore): fuori da lì Meta rifiuta, ed è una tutela,
 * non un ostacolo.
 *
 * # Uso
 *
 *   set -a && source .env.local && set +a
 *   export NODE_OPTIONS="--conditions=react-server"
 *   export META_TEST_TOKEN="EAAG..."     # mai come argomento: resta nella
 *                                        # cronologia della shell
 *
 *   npx --yes tsx scripts/meta-chiamata-whatsapp.ts --lista
 *   npx --yes tsx scripts/meta-chiamata-whatsapp.ts
 *   npx --yes tsx scripts/meta-chiamata-whatsapp.ts --invia 393331234567
 *
 * `--waba <id>` e `--numero <phone-number-id>` forzano gli identificativi
 * quando la scoperta automatica non basta.
 *
 * Dei segreti non si stampa mai il valore: né token né `appsecret_proof`.
 */

import { createHmac } from "node:crypto";
import { prisma } from "../lib/prisma";
import { decryptAccessToken } from "../lib/whatsapp/credentials";

const GRAPH_API_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const PERMESSO_GESTIONE = "whatsapp_business_management";
const PERMESSO_INVIO = "whatsapp_business_messaging";

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
  metodo: "GET" | "POST" = "GET",
  corpoJson?: unknown
): Promise<Esito> {
  /*
   * Il guasto di rete si ferma qui, con la sua causa.
   *
   * `fetch` in Node fallisce con un laconico "fetch failed" e mette il motivo
   * vero — DNS, connessione rifiutata, TLS, timeout — dentro `cause`. Senza
   * stamparlo, un problema di rete e un token rifiutato si presentano con la
   * stessa riga, e si finisce a rigenerare credenziali che andavano bene.
   */
  const risposta = await fetch(url, {
    method: metodo,
    ...(corpoJson
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpoJson) }
      : {}),
    signal: AbortSignal.timeout(20_000),
  }).catch((errore: unknown) => {
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
  invia?: string;
  waba?: string;
  numero?: string;
}

function leggiArgomenti(argv: string[]): Opzioni {
  const opzioni: Opzioni = {};

  for (let i = 0; i < argv.length; i++) {
    const voce = argv[i];
    if (!voce) continue;

    if (voce === "--invia" || voce === "--waba" || voce === "--numero") {
      const valore = argv[++i];
      if (!valore) esci(`L'opzione ${voce} richiede un valore.`);

      if (voce === "--invia") opzioni.invia = valore;
      else if (voce === "--waba") opzioni.waba = valore;
      else opzioni.numero = valore;
    }
  }

  return opzioni;
}

/** Le agenzie con WhatsApp configurato, e se il token è utilizzabile. */
async function elencaConfigurazioni(): Promise<void> {
  const configurazioni = await prisma.whatsAppConfig.findMany({
    select: {
      provider: true,
      isConnected: true,
      phoneNumber: true,
      metaAccessToken: true,
      metaPhoneAccountId: true,
      organization: { select: { agencyName: true, users: { select: { email: true }, take: 1 } } },
    },
  });

  if (configurazioni.length === 0) {
    console.log("\nNessuna agenzia ha configurato WhatsApp.\n");
    return;
  }

  console.log(`\n${configurazioni.length} configurazioni:\n`);
  for (const config of configurazioni) {
    const token = decryptAccessToken(config.metaAccessToken);
    console.log(`  ${config.organization.agencyName} — ${config.organization.users[0]?.email ?? "—"}`);
    console.log(`    provider: ${config.provider}, ${config.isConnected ? "collegato" : "non collegato"}`);
    console.log(`    numero: ${config.phoneNumber ?? "—"} (id ${config.metaPhoneAccountId ?? "—"})`);
    console.log(`    token Meta: ${token ? "presente e decifrabile" : "assente o non utilizzabile"}\n`);
  }
}

/**
 * I WABA posseduti dai Business dell'utente.
 *
 * Serve perché la via breve spesso non porta a niente: un token generato
 * nell'Explorer senza scegliere il Business ha i permessi WhatsApp ma
 * `granular_scopes` **senza `target_ids`**, e da lì il WABA non si ricava. Il
 * Business invece ce l'ha sempre, e chiederlo costa una chiamata.
 *
 * Senza questo ripiego l'unica strada era cercare l'id a mano in Business
 * Suite: un comando che si ferma dicendo "trova tu l'identificativo" ha fatto
 * metà del lavoro.
 */
async function wabaDaiBusiness(token: string, appSecret: string): Promise<string[]> {
  const risposta = await chiama(
    urlGraph("me/businesses", token, appSecret, {
      fields: "id,name,owned_whatsapp_business_accounts{id,name}",
      limit: "25",
    }),
    "GET /me/businesses"
  );

  const business = (risposta.corpo?.data ?? []) as Array<{
    name?: string;
    owned_whatsapp_business_accounts?: { data?: Array<{ id: string; name?: string }> };
  }>;

  const trovati: string[] = [];
  for (const singolo of business) {
    for (const waba of singolo.owned_whatsapp_business_accounts?.data ?? []) {
      console.log(`      ${waba.name ?? "—"} (id ${waba.id}) — Business ${singolo.name ?? "—"}`);
      trovati.push(waba.id);
    }
  }

  return trovati;
}

/**
 * I WABA a cui il token dà accesso, letti dal token stesso.
 *
 * `granular_scopes` dice non solo *quali* permessi ha il token, ma su *quali
 * oggetti*: per i permessi WhatsApp quei `target_ids` sono gli identificativi
 * dei WhatsApp Business Account. È la via più corta quando c'è, e non richiede
 * nessuna chiamata in più.
 */
function wabaDalToken(granulari: unknown): string[] {
  if (!Array.isArray(granulari)) return [];

  const voci = granulari as Array<{ scope?: string; target_ids?: string[] }>;
  const gestione = voci.find((voce) => voce.scope === PERMESSO_GESTIONE);
  const invio = voci.find((voce) => voce.scope === PERMESSO_INVIO);

  return [...(gestione?.target_ids ?? []), ...(invio?.target_ids ?? [])].filter(
    (id, indice, tutti) => tutti.indexOf(id) === indice
  );
}

async function main(): Promise<void> {
  const argomenti = process.argv.slice(2);

  if (argomenti[0] === "--lista" || argomenti[0] === "--list") {
    await elencaConfigurazioni();
    return;
  }

  const opzioni = leggiArgomenti(argomenti);

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    esci(
      "NEXT_PUBLIC_META_APP_ID o META_APP_SECRET non caricati.\n" +
        "Serve: set -a && source .env.local && set +a"
    );
  }

  const token = process.env.META_TEST_TOKEN?.trim();
  if (!token) {
    esci(
      "META_TEST_TOKEN non impostato.\n\n" +
        "Le variabili WHATSAPP_* di .env.local sono segnaposto (NON_LETTO_DALL_APP__...):\n" +
        "l'app legge le credenziali WhatsApp dalla tabella WhatsAppConfig, per agenzia.\n" +
        "Genera un token nell'Explorer per l'API Graph con i permessi whatsapp_business_management\n" +
        "e whatsapp_business_messaging, poi scrivilo in .env.local come META_TEST_TOKEN."
    );
  }

  /*
   * Primo passo: di quali permessi dispone davvero questo token, e per quale
   * app. È la domanda che decide tutto il resto, ed è già costata un giro a
   * vuoto sui commenti Instagram: l'Explorer ricorda l'ultima app usata, e una
   * chiamata riuscita con il token di un'altra app finisce nella telemetria di
   * quell'altra, indistinguibile da una chiamata mai partita.
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

  const dati = (debug.corpo?.data ?? {}) as {
    scopes?: string[];
    type?: string;
    app_id?: string;
    granular_scopes?: unknown;
  };
  const permessi = dati.scopes ?? [];

  console.log(`      tipo: ${dati.type ?? "—"}`);
  console.log(`      app del token: ${dati.app_id ?? "—"}`);
  console.log(`      concessi: ${permessi.length ? permessi.join(", ") : "—"}`);

  if (dati.app_id && dati.app_id !== appId) {
    esci(
      `\n✘ Il token appartiene all'app ${dati.app_id}, non alla nostra (${appId}).\n` +
        "Le chiamate conterebbero per quell'altra app. Riseleziona l'app nell'Explorer.\n"
    );
  }

  const mancanti = [PERMESSO_GESTIONE, PERMESSO_INVIO].filter((p) => !permessi.includes(p));
  if (mancanti.length === 2) {
    esci(
      `\n✘ Il token non ha nessuno dei due permessi (${mancanti.join(", ")}).\n` +
        "Rigeneralo nell'Explorer spuntandoli entrambi.\n"
    );
  }
  if (mancanti.length === 1) {
    console.log(`\n⚠ Manca "${mancanti[0]}": quella chiamata verrà saltata.`);
  }

  /* ── 1. whatsapp_business_management: lettura dei numeri ── */

  let numeroDiProva = opzioni.numero;

  if (permessi.includes(PERMESSO_GESTIONE)) {
    let waba = opzioni.waba ?? wabaDalToken(dati.granular_scopes)[0];

    if (!waba) {
      console.log("\nIl token non dichiara nessun WABA: li cerco fra i Business.");
      waba = (await wabaDaiBusiness(token, appSecret))[0];
    }

    if (!waba) {
      esci(
        "\n✘ Nessun WhatsApp Business Account trovato.\n" +
          "Se l'app non ha ancora un numero di prova, si crea dalla scheda WhatsApp\n" +
          "dell'app: Meta ne fornisce uno gratuito. Altrimenti indicalo con --waba <id>.\n"
      );
    }

    console.log(`\nChiamata con "${PERMESSO_GESTIONE}" (WABA ${waba}):`);
    const numeri = await chiama(
      urlGraph(`${waba}/phone_numbers`, token, appSecret, {
        fields: "id,display_phone_number,verified_name,quality_rating",
      }),
      "GET /{waba-id}/phone_numbers"
    );

    const elenco = (numeri.corpo?.data ?? []) as Array<{
      id: string;
      display_phone_number?: string;
      verified_name?: string;
    }>;

    for (const numero of elenco) {
      console.log(
        `      ${numero.display_phone_number ?? "—"} — ${numero.verified_name ?? "—"} (id ${numero.id})`
      );
    }

    // Il primo numero serve anche alla seconda chiamata: senza, andrebbe
    // cercato a mano proprio mentre lo abbiamo già in mano.
    numeroDiProva = numeroDiProva ?? elenco[0]?.id;
  }

  /* ── 2. whatsapp_business_messaging: invio di un messaggio vero ── */

  if (!opzioni.invia) {
    console.log(
      `\n"${PERMESSO_INVIO}" non è stato usato: serve un invio vero, e un invio vero` +
        "\nsquilla sul telefono di qualcuno. Rilancia con:" +
        "\n  npx --yes tsx scripts/meta-chiamata-whatsapp.ts --invia <numero con prefisso>\n"
    );
    return;
  }

  if (!permessi.includes(PERMESSO_INVIO)) {
    esci(`\n✘ Il token non ha "${PERMESSO_INVIO}": l'invio non partirebbe.\n`);
  }

  if (!numeroDiProva) {
    esci(
      "\n✘ Non so da quale numero inviare.\n" +
        "Indicalo con --numero <phone-number-id>.\n"
    );
  }

  console.log(`\nChiamata con "${PERMESSO_INVIO}" (da ${numeroDiProva} a ${opzioni.invia}):`);

  /*
   * Template `hello_world`, non un testo libero.
   *
   * Fuori dalla finestra di 24 ore Meta accetta solo messaggi da modello
   * approvato, e `hello_world` è quello che esiste su ogni WABA appena creato.
   * Un testo libero riceverebbe un errore di policy, e sembrerebbe un permesso
   * mancante quando invece è solo la regola sui modelli.
   */
  const invio = await chiama(
    urlGraph(`${numeroDiProva}/messages`, token, appSecret),
    "POST /{phone-number-id}/messages",
    "POST",
    {
      messaging_product: "whatsapp",
      to: opzioni.invia,
      type: "template",
      template: { name: "hello_world", language: { code: "en_US" } },
    }
  );

  if (!invio.ok) {
    esci("\n✘ Invio non riuscito: la telemetria di questo permesso non si muove.\n");
  }

  console.log("\n✔ Messaggio accettato da Meta.");
  console.log("  Entrambe le chiamate sono nei log. Il contatore dell'App Review");
  console.log("  si aggiorna entro qualche minuto (a volte fino a 24 ore).\n");
}

main()
  .then(() => process.exit(0))
  .catch((errore) => {
    console.error("Errore:", errore instanceof Error ? errore.message : errore);
    process.exit(1);
  });
