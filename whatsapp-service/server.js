import express from "express";
import { timingSafeEqual } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import QRCode from "qrcode";
import { describeSender, resolveSendJid } from "./jid.js";
import {
  makeWASocket,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";

/**
 * Tetto ai byte di una nota vocale.
 *
 * Allineato al limite di 4,5 MB sul corpo di una funzione serverless: in
 * base64 i byte crescono di circa un terzo, quindi un file piu' grande non
 * arriverebbe comunque a destinazione.
 */
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

/**
 * Microservizio di sessione WhatsApp per PropertyTech.
 *
 * Tiene aperto il socket verso WhatsApp e implementa il contratto che la
 * piattaforma si aspetta (vedi README.md). Vive fuori da Vercel perché
 * l'abbinamento via QR richiede una connessione persistente e uno stato che
 * sopravvive fra un messaggio e l'altro: in serverless non può esistere.
 *
 * ATTENZIONE: Baileys è un client NON ufficiale. WhatsApp può bannare i
 * numeri che lo usano. Vedi l'avvertenza in apertura del README.
 */

const app = express();
app.use(express.json());

const TOKEN = process.env.SERVICE_TOKEN;
const WEBHOOK = process.env.PLATFORM_WEBHOOK_URL;
const SESSIONS_DIR = process.env.SESSIONS_DIR || "./sessions";

/**
 * Cancella dal disco le credenziali di una sessione.
 *
 * # Quando va fatto, e quando NON va fatto
 *
 * Va fatto quando le credenziali sono **morte**: logout dal telefono, o
 * distacco chiesto dall'agenzia. Da quel momento WhatsApp non riconosce piu'
 * quella sessione, ma i file restavano sul volume e `useMultiFileAuthState`
 * li ricaricava al tentativo successivo. Il socket si apriva presentando
 * credenziali che il server ha gia' invalidato, le init queries non
 * ricevevano risposta, e l'abbinamento moriva con un 408 — cioe' il sintomo
 * che sembra un problema di timeout e invece e' un residuo del collegamento
 * precedente.
 *
 * NON va fatto su un 408 o su una caduta passeggera. Li' le credenziali sono
 * buone e il socket va solo riaperto: cancellarle costringerebbe l'agenzia a
 * riscansionare il QR per un'interruzione di rete di due secondi.
 *
 * Non lancia mai: e' sempre l'ultimo passo di una procedura che deve
 * concludersi comunque, e una cartella gia' assente non e' un errore.
 */
async function eliminaCredenziali(sessionId, motivo) {
  try {
    await rm(`${SESSIONS_DIR}/${sessionId}`, { recursive: true, force: true });
    console.log(`[${sessionId}] credenziali rimosse dal disco (${motivo})`);
  } catch (error) {
    console.error(`[${sessionId}] rimozione credenziali non riuscita:`, error.message);
  }
}
const PORT = process.env.PORT || 3000;

if (!TOKEN) {
  // Meglio non partire che partire aperto: chi raggiunge questo servizio può
  // scrivere ai clienti dell'agenzia a suo nome.
  throw new Error("SERVICE_TOKEN mancante: il servizio resterebbe aperto a chiunque.");
}

/**
 * Cache minima con l'interfaccia che Baileys si aspetta (`get`, `set`,
 * `del`, `flushAll`).
 *
 * Scritta a mano invece di aggiungere `node-cache`: servono quattro metodi
 * su una Map, e una dipendenza in meno e' una dipendenza in meno da
 * aggiornare su un servizio che deve solo restare in piedi.
 *
 * Il tetto sulle voci evita che una sessione longeva accumuli chiavi per
 * sempre: superata la soglia si scarta la piu' vecchia, che e' anche quella
 * con meno probabilita' di servire ancora.
 */
function creaCache(maxVoci = 1000) {
  const dati = new Map();
  return {
    get: (chiave) => dati.get(chiave),
    set: (chiave, valore) => {
      if (dati.size >= maxVoci) dati.delete(dati.keys().next().value);
      dati.set(chiave, valore);
      return true;
    },
    del: (chiave) => dati.delete(chiave),
    flushAll: () => dati.clear(),
  };
}

/**
 * Logger minimo per Baileys.
 *
 * Baileys si aspetta un'interfaccia tipo pino. Qui interessa solo che gli
 * errori si vedano nei log di Render: il resto e' rumore a volume altissimo
 * su una connessione WhatsApp, e finirebbe per nascondere proprio le righe
 * che servono a diagnosticare.
 */
const loggerBaileys = {
  level: "error",
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: (...args) => console.error("[baileys]", ...args),
  fatal: (...args) => console.error("[baileys][fatal]", ...args),
  child: () => loggerBaileys,
};

/** Una sessione per agenzia. In memoria, ricostruita dal disco alla riconnessione. */
const sessions = new Map();

/**
 * Sonda di salute, **prima** dell'autenticazione: Render la interroga senza
 * credenziali, e dietro il middleware riceverebbe 401 marcando il servizio
 * come non sano.
 */
app.get("/health", (_req, res) => {
  res.json({ ok: true, sessions: sessions.size });
});

app.use((req, res, next) => {
  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  // Confronto a tempo costante, come fa la piattaforma sul webhook di ritorno:
  // un confronto ingenuo trasforma il token in un oracolo misurabile.
  const atteso = Buffer.from(TOKEN);
  const ricevuto = Buffer.from(bearer);
  if (ricevuto.length !== atteso.length || !timingSafeEqual(ricevuto, atteso)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

/** Attesa massima per una consegna alla piattaforma. */
/**
 * Attesa massima della piattaforma su un messaggio inoltrato.
 *
 * Quarantacinque secondi e non quindici. La piattaforma, prima di rispondere,
 * elabora il messaggio per intero: chiamata al modello, ritardo di digitazione
 * e invio della risposta. Con il vecchio limite l'attesa scadeva su ogni
 * conversazione un po' lenta, e il microservizio registrava un errore per una
 * consegna che invece era andata a buon fine.
 *
 * Il limite serve comunque: i messaggi si elaborano in sequenza dentro
 * `messages.upsert`, quindi una consegna appesa a tempo indefinito fermerebbe
 * tutti i messaggi successivi di quella sessione. Meglio un'attesa lunga che
 * finisce, che una infinita.
 */
const NOTIFY_TIMEOUT_MS = 45_000;

/**
 * URL di destinazione su Vercel, atteso in `PLATFORM_WEBHOOK_URL`.
 *
 * In produzione vale:
 *   https://propertytechsolutions.net/api/whatsapp/qr/webhook
 *
 * Non c'e' un valore predefinito di proposito. Un default punterebbe alla
 * produzione anche da un'istanza di prova, e i messaggi di collaudo
 * finirebbero nella pipeline dell'agenzia vera: un guasto peggiore di quello
 * che il default eviterebbe. Meglio non consegnare e dirlo forte.
 */
const WEBHOOK_ATTESO = "https://propertytechsolutions.net/api/whatsapp/qr/webhook";

/** Riassunto del payload per i log, senza versarci dentro dati personali. */
function riassuntoPayload(payload) {
  const m = payload.message;
  if (!m) return { evento: payload.event, sessionId: payload.sessionId };

  return {
    evento: payload.event,
    sessionId: payload.sessionId,
    // Numero troncato: nei log resta abbastanza per riconoscere una
    // conversazione senza conservare il recapito di una persona.
    da: String(m.from || "").slice(0, 6) + "...",
    jid: m.jid,
    caratteri: (m.text || "").length,
    anteprima: (m.text || "").replace(/\s+/g, " ").slice(0, 60),
    audio: Boolean(m.audio),
    dallAgenzia: Boolean(m.fromAgent),
  };
}

async function notify(payload) {
  if (!WEBHOOK) {
    /*
     * Era `return` e basta: nessun log, nessuna traccia.
     *
     * E' il guasto peggiore possibile qui, perche' silenzioso e
     * indistinguibile dal servizio spento. Il servizio risulta "Live", Baileys
     * riceve i messaggi, e sulla piattaforma non arriva nulla: nei log di
     * Render non compare una riga e in quelli di Vercel nemmeno, perche' la
     * richiesta non parte proprio.
     */
    console.error(
      `[RENDER WEBHOOK OUT] NON INVIATO: PLATFORM_WEBHOOK_URL non impostata. ` +
        `Impostala nelle variabili d'ambiente di Render a ${WEBHOOK_ATTESO} e riavvia il servizio.`,
      riassuntoPayload(payload)
    );
    return;
  }

  console.log("[RENDER WEBHOOK OUT]", WEBHOOK, riassuntoPayload(payload));

  try {
    const risposta = await fetch(WEBHOOK, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      // Senza timeout una piattaforma che non risponde bloccava QUESTO await
      // a tempo indefinito. I messaggi si elaborano in sequenza dentro il
      // gestore di `messages.upsert`: una sola consegna appesa fermava tutti i
      // messaggi successivi di quella sessione, in silenzio.
      signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
    });

    /*
     * `fetch` non lancia sugli stati di errore: risolve anche con 401 o 500.
     * Senza questo controllo una consegna rifiutata risultava riuscita, e un
     * token disallineato fra Render e Vercel sarebbe stato invisibile da
     * entrambe le parti.
     */
    if (!risposta.ok) {
      const dettaglio = await risposta.text().catch(() => "");
      console.error(
        `[RENDER WEBHOOK OUT] RIFIUTATO dalla piattaforma: HTTP ${risposta.status}`,
        {
          dettaglio: dettaglio.slice(0, 200),
          suggerimento:
            risposta.status === 401
              ? "SERVICE_TOKEN su Render deve coincidere con WHATSAPP_SERVICE_TOKEN su Vercel."
              : risposta.status === 404
                ? `URL errato: atteso un percorso come ${WEBHOOK_ATTESO}.`
                : undefined,
        }
      );
      return;
    }

    console.log(`[RENDER WEBHOOK OUT] consegnato: HTTP ${risposta.status}`);
  } catch (error) {
    // Non blocca: la piattaforma interroga comunque /status mentre il QR è a
    // schermo, quindi un webhook perso non impedisce l'abbinamento. Impedisce
    // però la ricezione dei messaggi, quindi va guardato nei log.
    const scaduto = error && error.name === "TimeoutError";
    console.error(
      `[RENDER WEBHOOK OUT] ERRORE DI RETE${scaduto ? " (timeout)" : ""}:`,
      error.message,
      { url: WEBHOOK, timeoutMs: NOTIFY_TIMEOUT_MS }
    );
  }
}

/** Tentativi di riconnessione consecutivi, per sessione. */
const retryCount = new Map();
const MAX_RETRY_DELAY_MS = 5 * 60_000;

/**
 * Attesa prima del prossimo tentativo: 3s, 6s, 12s… fino a cinque minuti.
 *
 * Prima era un `setTimeout` fisso di 3 secondi senza tetto: davanti a un
 * errore persistente — numero bannato, credenziali invalidate — il servizio
 * martellava WhatsApp venti volte al minuto per sempre, che è anche il modo
 * migliore per peggiorare un ban.
 */
function retryDelay(sessionId) {
  const tentativo = (retryCount.get(sessionId) ?? 0) + 1;
  retryCount.set(sessionId, tentativo);
  return Math.min(3000 * 2 ** (tentativo - 1), MAX_RETRY_DELAY_MS);
}

/**
 * Ogni quanto si controlla lo stato delle sessioni.
 *
 * Un minuto: abbastanza spesso da riagganciare prima che l'agenzia se ne
 * accorga, abbastanza raro da non pesare su un servizio che tiene aperti N
 * socket.
 *
 * Regolabile da `HEALTH_INTERVAL_MS` senza toccare il codice: una soglia che
 * si tara solo con un deploy, in pratica non si tara.
 */
const INTERVALLO_SORVEGLIANZA_MS = Number(process.env.HEALTH_INTERVAL_MS) || 60_000;

/**
 * Da quanto una sessione deve essere giu' prima di chiamare qualcuno.
 *
 * Cinque minuti, perche' sotto quella soglia e' quasi sempre il backoff che
 * sta facendo il suo lavoro: una caduta passeggera si risolve in pochi
 * secondi, e un avviso a ogni singhiozzo insegna a ignorare gli avvisi.
 */
const SOGLIA_ALLERTA_MS = Number(process.env.HEALTH_ALERT_MS) || 5 * 60_000;

/**
 * Le sessioni che **dovrebbero** essere collegate.
 *
 * Diversa da `sessions`, che contiene solo i socket vivi: quella mappa viene
 * svuotata a ogni caduta, quindi da sola non permette di accorgersi che una
 * sessione manca. Qui invece la voce resta finche' l'agenzia non si stacca
 * davvero (logout dal telefono o distacco dalla piattaforma), ed e' cio' che
 * rende possibile sia il riaggancio sia l'allerta.
 *
 * sessionId -> { giuDa, allertata, prossimoTentativo }
 */
const sessioniNote = new Map();

function segnaNota(sessionId) {
  if (!sessioniNote.has(sessionId)) {
    sessioniNote.set(sessionId, { giuDa: null, allertata: false, prossimoTentativo: 0 });
  }
}

/**
 * Registra che un tentativo di riconnessione e' gia' in calendario.
 *
 * Serve a tenere separati i due meccanismi. Il backoff sulla
 * `connection.update` e' quello che comanda: sa da quante volte si sta
 * riprovando e allunga l'attesa di conseguenza, che davanti a un numero
 * bannato e' l'unica cosa sensata da fare. La sorveglianza e' una rete, e una
 * rete non deve tirare la corda: senza questa informazione richiamava
 * `startSession` a ogni giro, annullando l'attesa progressiva proprio nel
 * caso in cui serve di piu'.
 */
function programmaTentativo(sessionId, fraMs) {
  segnaNota(sessionId);
  sessioniNote.get(sessionId).prossimoTentativo = Date.now() + fraMs;
}

function dimentica(sessionId) {
  sessioniNote.delete(sessionId);
}

/**
 * Riapre all'avvio le sessioni gia' abbinate.
 *
 * # Il guasto che chiude
 *
 * Le credenziali vivono sul volume e sopravvivono ai riavvii, ma **nessuno
 * riapriva i socket**: dopo ogni deploy di Render — o dopo un riavvio per
 * qualunque motivo — il WhatsApp di ogni agenzia restava muto finche'
 * qualcuno non riapriva la pagina e premeva "Connetti". E nessuno lo faceva,
 * perche' in piattaforma la sessione risultava ancora collegata: l'evento di
 * disconnessione non era mai partito, il processo era semplicemente morto
 * insieme al socket.
 *
 * Il sintomo e' quello piu' difficile da attribuire: "l'assistente ha
 * smesso di rispondere e non abbiamo toccato niente".
 *
 * # Perche' scaglionate
 *
 * Aprire venti socket nello stesso istante significa venti handshake
 * simultanei verso WhatsApp da uno stesso indirizzo: e' il modo piu' rapido
 * per farsi limitare. Due secondi di distanza costano quaranta secondi
 * all'avvio e non li nota nessuno.
 *
 * # Perche' solo quelle registrate
 *
 * Una cartella puo' contenere i resti di un abbinamento mai completato: un
 * `creds.json` senza `me`, lasciato da chi ha aperto il QR e non l'ha
 * scansionato. Riaprirla non collegherebbe niente e genererebbe QR che
 * nessuno guarda.
 */
async function ripristinaSessioni() {
  let voci;
  try {
    voci = await readdir(SESSIONS_DIR, { withFileTypes: true });
  } catch {
    console.log("nessuna sessione da ripristinare (cartella assente)");
    return;
  }

  const candidate = voci.filter((v) => v.isDirectory()).map((v) => v.name);
  const daRiaprire = [];

  for (const sessionId of candidate) {
    try {
      const creds = JSON.parse(
        await readFile(`${SESSIONS_DIR}/${sessionId}/creds.json`, "utf8")
      );
      if (creds?.me?.id) daRiaprire.push(sessionId);
      else console.log(`[${sessionId}] abbinamento mai completato: non la riapro`);
    } catch {
      // Nessun creds.json, o illeggibile: non c'e' una sessione da riprendere.
      console.log(`[${sessionId}] credenziali assenti o illeggibili: non la riapro`);
    }
  }

  console.log(
    `ripristino sessioni: ${daRiaprire.length} da riaprire su ${candidate.length} cartelle`
  );

  for (const sessionId of daRiaprire) {
    segnaNota(sessionId);
    try {
      await startSession(sessionId);
      console.log(`[${sessionId}] riaperta all'avvio`);
    } catch (error) {
      // Una sessione che non riparte non deve impedire alle altre di ripartire.
      console.error(`[${sessionId}] riapertura non riuscita:`, error?.message ?? error);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/**
 * Controllo periodico: riaggancia in silenzio, e chiama aiuto se non ci riesce.
 *
 * Il backoff sulla `connection.update` copre le cadute che WhatsApp annuncia.
 * Questo giro copre tutto il resto — un socket morto senza evento, un
 * `setTimeout` di riconnessione perso in un riavvio, una sessione che non e'
 * mai ripartita — cioe' i casi in cui nessuno riproverebbe mai piu'.
 */
function avviaSorveglianza() {
  setInterval(async () => {
    for (const [sessionId, stato] of sessioniNote) {
      const entry = sessions.get(sessionId);

      if (entry?.status === "connected") {
        if (stato.giuDa) console.log(`[${sessionId}] tornata su`);
        stato.giuDa = null;
        stato.allertata = false;
        stato.prossimoTentativo = 0;
        continue;
      }

      stato.giuDa ??= Date.now();
      const giuDaMs = Date.now() - stato.giuDa;

      /*
       * Riaggancio silenzioso, ma solo quando non ci pensa gia' qualcun altro.
       *
       * Due condizioni, per due guasti diversi. `sock`/`starting` esclude che
       * ci sia un socket vivo o in apertura: senza, si aprirebbero due socket
       * sulla stessa sessione, che significa messaggi consegnati due volte e
       * credenziali che si sovrascrivono. `prossimoTentativo` esclude che il
       * backoff abbia gia' fissato un appuntamento: intervenire prima
       * annullerebbe l'attesa progressiva, e su un numero bannato tornare a
       * bussare ogni minuto e' il modo migliore per peggiorare le cose.
       *
       * Quello che resta — nessun socket, nessun tentativo in calendario — e'
       * esattamente il caso che prima non riprovava mai piu': un socket morto
       * senza evento di chiusura, o un timer perso in un riavvio.
       */
      const attesaScaduta = Date.now() >= (stato.prossimoTentativo ?? 0);

      if (!entry?.sock && !entry?.starting && attesaScaduta) {
        console.log(`[${sessionId}] non collegata da ${Math.round(giuDaMs / 1000)}s: riprovo`);
        // Anche il tentativo della sorveglianza entra in calendario, con la
        // stessa attesa progressiva: due reti che riprovano a ritmo pieno
        // sarebbero peggio di nessuna rete.
        programmaTentativo(sessionId, retryDelay(sessionId));
        startSession(sessionId).catch((error) =>
          console.error(`[${sessionId}] riaggancio non riuscito:`, error?.message ?? error)
        );
      }

      // Una sola allerta per episodio: si riarma quando la sessione torna su.
      if (giuDaMs >= SOGLIA_ALLERTA_MS && !stato.allertata) {
        stato.allertata = true;
        console.error(
          `[${sessionId}] NON RIAGGANCIATA da ${Math.round(giuDaMs / 60_000)} minuti: avviso la piattaforma`
        );
        await notify({ sessionId, event: "unhealthy", unhealthyForMs: giuDaMs });
      }
    }
  }, INTERVALLO_SORVEGLIANZA_MS);
}

async function startSession(sessionId) {
  const existing = sessions.get(sessionId);
  // `starting` e non solo `sock`: fra la creazione della voce e
  // l'assegnazione del socket c'e' un `await`, e due chiamate ravvicinate
  // (il polling del QR mentre arriva un riavvio) vedevano entrambe `sock`
  // ancora null e aprivano DUE socket sulla stessa sessione. Due socket
  // significano messaggi consegnati due volte e credenziali che si
  // sovrascrivono a vicenda.
  if (existing?.sock || existing?.starting) return existing;

  const entry = { sock: null, qr: null, status: "pending", phoneNumber: null, starting: true };
  sessions.set(sessionId, entry);

  const { state, saveCreds } = await useMultiFileAuthState(`${SESSIONS_DIR}/${sessionId}`);

  /**
   * Cache dei tentativi di riconsegna.
   *
   * E' la correzione dell'errore `failed to find key` sui messaggi `pkmsg`.
   * Quando arriva un messaggio cifrato con una chiave che non abbiamo — capita
   * dopo un abbinamento nuovo, perche' il mittente sta ancora usando la
   * sessione precedente — Baileys deve poter mandare una *retry receipt* e
   * farselo rispedire. Senza questa cache non tiene il conto dei tentativi,
   * non manda la ricevuta, e il messaggio resta indecifrabile per sempre: si
   * vede l'errore in rosso e il messaggio non arriva mai alla piattaforma.
   */
  const msgRetryCounterCache = creaCache();

  /**
   * Messaggi che abbiamo inviato, per poterli rispedire se il telefono del
   * cliente ci manda una richiesta di retry. Tenuti in memoria e in numero
   * limitato: se il servizio riparte si perdono, e Baileys ripiega da solo.
   */
  entry.inviati = new Map();

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      /*
       * Le chiavi Signal passano da una cache in memoria.
       *
       * `useMultiFileAuthState` legge e scrive un file per chiave: sotto
       * raffica di messaggi le letture si accavallano e una chiave appena
       * scritta puo' non essere ancora visibile, che e' una delle strade per
       * cui compare `failed to find key`.
       */
      keys: makeCacheableSignalKeyStore(state.keys, loggerBaileys),
    },
    printQRInTerminal: false,
    logger: loggerBaileys,
    msgRetryCounterCache,

    /*
     * ─── Stabilita' dell'abbinamento ───
     *
     * Il sintomo da cui nascono queste righe: durante la scansione del QR il
     * socket moriva con `unexpected error in 'init queries' (statusCode: 408)`.
     * Le "init queries" sono le interrogazioni che Baileys manda appena la
     * connessione si apre; se una non risponde entro il timeout, l'abbinamento
     * resta a meta' e il QR va rifatto.
     *
     * Si agisce sulle due leve insieme: **meno lavoro** da fare all'apertura, e
     * **piu' tempo** per farlo.
     */

    /*
     * Niente cronologia.
     *
     * `syncFullHistory: false` e' gia' il valore predefinito di Baileys 6.7 —
     * scritto qui perche' un default non dichiarato e' un default che cambia
     * senza che nessuno se ne accorga. La riga che conta davvero e' quella
     * sotto: `shouldSyncHistoryMessage` vale `() => true` di default, quindi
     * al login la cronologia che WhatsApp riversa veniva comunque elaborata.
     * Su un numero di agenzia con migliaia di conversazioni e' proprio il
     * lavoro che fa scadere le init queries.
     *
     * Non si perde niente: i messaggi vecchi venivano gia' scartati piu'
     * avanti (`type !== "notify"`). Qui si evita di riceverli.
     */
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,

    /*
     * Non dichiararsi "online" all'apertura.
     *
     * Oltre a togliere una query al momento piu' affollato, ha un effetto che
     * l'agenzia nota: finche' il client web risulta online, WhatsApp smette di
     * mandare le notifiche push al telefono dell'agente. Con `false` il
     * telefono continua a suonare come prima.
     */
    markOnlineOnConnect: false,

    /*
     * Il default e' 20 secondi, ed e' poco per un'istanza che si e' appena
     * svegliata: il primo abbinamento della giornata paga anche l'avvio del
     * processo e la latenza verso i server di WhatsApp.
     */
    connectTimeoutMs: 60_000,

    /*
     * E' questo il timeout che scade nelle init queries: usano la durata
     * predefinita delle interrogazioni, 60 secondi. Portarla a 90 non rende
     * il socket piu' lento — si aspetta solo quando serve davvero — e
     * trasforma un abbinamento fallito in un abbinamento lento.
     */
    defaultQueryTimeoutMs: 90_000,

    /*
     * Un battito piu' frequente del default (30s): su un host che sospende le
     * connessioni inattive, trenta secondi di silenzio bastano a far cadere il
     * socket senza che nessuna delle due parti se ne accorga.
     */
    keepAliveIntervalMs: 20_000,
    /**
     * Serve a Baileys quando il cliente chiede di rispedire un messaggio che
     * non e' riuscito a decifrare. Senza, Baileys non ha nulla da mandare e
     * registra un errore; con questo, il cliente riceve davvero il messaggio.
     */
    getMessage: async (key) => {
      const salvato = entry.inviati.get(`${key.remoteJid}:${key.id}`);
      return salvato || undefined;
    },
  });
  entry.sock = sock;
  entry.starting = false;
  // Da qui in poi questa sessione "dovrebbe" essere collegata: se cade, e'
  // la sorveglianza a doversene occupare.
  segnaNota(sessionId);

  sock.ev.on("creds.update", saveCreds);


  /*
   * Tutto il gestore dentro un try/catch, e non e' prudenza generica.
   *
   * Questo ascoltatore e' `async`: un'eccezione al suo interno non risale a
   * nessuno, diventa una promise rifiutata senza gestore, e su Node recente
   * quello basta a **terminare il processo** — cioe' a far cadere le sessioni
   * di tutte le agenzie per un errore su una sola. Dentro ci sono tre
   * chiamate che possono fallire davvero: la generazione del QR, la notifica
   * alla piattaforma e la pulizia su disco.
   *
   * Qui non si rimedia all'errore, si impedisce che si porti via il resto: la
   * riga nei log dice cosa e' successo, e la riconnessione riparte comunque.
   */
  sock.ev.on("connection.update", async (update) => {
   try {
    const { connection, lastDisconnect, qr } = update;

    if (qr) entry.qr = await QRCode.toDataURL(qr);

    if (connection === "open") {
      entry.status = "connected";
      entry.qr = null;
      entry.phoneNumber = sock.user?.id?.split(":")[0] ?? null;
      // Connessione riuscita: il prossimo distacco riparte da tre secondi.
      retryCount.delete(sessionId);
      console.log(`[${sessionId}] connesso: ${entry.phoneNumber}`);
      await notify({ sessionId, event: "connected", phoneNumber: entry.phoneNumber });
    }

    if (connection === "close") {
      entry.status = "disconnected";
      const code = lastDisconnect?.error?.output?.statusCode;

      /*
       * 515 (restartRequired): non e' una caduta, e' un passaggio previsto.
       *
       * WhatsApp lo manda subito dopo l'abbinamento e pretende che il socket
       * venga riaperto: i file di autenticazione sono validi e vanno lasciati
       * dove sono. Prima finiva nel percorso generico e produceva due effetti
       * sbagliati: la piattaforma riceveva `disconnected` un istante dopo un
       * abbinamento riuscito — ed e' il motivo per cui in scheda la sessione
       * risultava staccata — e la riapertura aspettava il ritardo progressivo
       * pensato per le cadute vere.
       */
      if (code === DisconnectReason.restartRequired) {
        console.log(`[${sessionId}] riavvio richiesto dopo l'abbinamento (515): riapro subito`);
        sessions.delete(sessionId);
        // Nessun `notify` di disconnessione: la sessione non e' caduta, e
        // dirlo alla piattaforma la farebbe risultare scollegata per nulla.
        setTimeout(() => startSession(sessionId), 0);
        return;
      }

      console.log(`[${sessionId}] disconnesso (codice ${code})`);
      await notify({ sessionId, event: "disconnected" });

      // Riconnessione automatica salvo logout esplicito dal telefono: con un
      // client non ufficiale la caduta è frequente e quasi sempre passeggera.
      if (code !== DisconnectReason.loggedOut) {
        sessions.delete(sessionId);
        const attesa = retryDelay(sessionId);
        // Dichiarato alla sorveglianza, che altrimenti riproverebbe prima.
        programmaTentativo(sessionId, attesa);
        console.log(`[${sessionId}] riprovo fra ${Math.round(attesa / 1000)}s`);
        setTimeout(() => startSession(sessionId), attesa);
      } else {
        // Logout esplicito dal telefono: la sessione non va riaperta, e il
        // contatore va azzerato o il prossimo abbinamento erediterebbe
        // l'attesa accumulata da quello precedente.
        retryCount.delete(sessionId);
        sessions.delete(sessionId);

        // E le credenziali vanno via dal disco. Da qui in poi WhatsApp non
        // riconosce piu' questa sessione: tenerle significa ripresentarle al
        // prossimo abbinamento e farlo morire in init queries.
        dimentica(sessionId);
        await eliminaCredenziali(sessionId, "logout dal telefono");
      }
    }
   } catch (error) {
    // Vedi il commento sopra: qui si assorbe per non far cadere il processo.
    // Lo stato della sessione resta quello che e', e la riconnessione
    // programmata prima dell'errore parte lo stesso.
    console.error(`[${sessionId}] errore nel gestore della connessione:`, error?.message ?? error);
   }
  });

  /*
   * Ogni messaggio nel proprio try/catch, non l'intero lotto.
   *
   * WhatsApp consegna i messaggi a gruppi. Con un solo try attorno al ciclo,
   * un'eccezione su uno — una nota vocale malformata, un tipo inatteso —
   * scartava anche tutti quelli che venivano dopo nello stesso lotto, in
   * silenzio. Ed essendo il gestore `async`, l'eccezione diventava una
   * promise rifiutata senza gestore: su Node recente basta a terminare il
   * processo, cioe' a far cadere la sessione WhatsApp per un singolo
   * messaggio storto.
   */
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    /*
     * Solo i messaggi che arrivano ADESSO.
     *
     * Baileys riusa questo evento anche per la cronologia che WhatsApp
     * riversa alla riconnessione, con `type: "append"`. Quei messaggi sono
     * gia' passati: rispondere a una richiesta di tre giorni fa come se fosse
     * appena arrivata e' peggio del silenzio.
     *
     * Ma un messaggio scritto mentre la sessione era giu' rientra da questa
     * porta, e finora usciva senza lasciare niente: era la prima cosa da
     * escludere quando un messaggio di prova "non arriva" e la riga non
     * c'era. Ora si vede.
     */
    if (type !== "notify") {
      console.log(
        `[WEBHOOK IGNORATO]: ${messages.length} messaggio/i di tipo "${type}" su ${sessionId} ` +
        `(cronologia o aggiornamento, non consegna in tempo reale)`
      );
      return;
    }

    const gestisciMessaggio = async (msg) => {
      // I gruppi restano fuori: la qualificazione riguarda conversazioni
      // uno-a-uno con un cliente.
      if (msg.key.remoteJid?.endsWith("@g.us")) {
        console.log(`[WEBHOOK IGNORATO]: messaggio di gruppo su ${sessionId}`);
        return;
      }

      /*
       * Messaggio arrivato ma non decifrabile.
       *
       * Quando Baileys non trova la chiave Signal, il messaggio arriva con
       * `message` a null e spesso un `messageStubType`. Non e' un guasto
       * nostro e non c'e' niente da inoltrare: la richiesta di riconsegna la
       * manda Baileys da solo grazie a `msgRetryCounterCache`, e il messaggio
       * ricompare qui decifrato pochi secondi dopo.
       *
       * Va registrato e saltato, non lasciato proseguire: senza `message` il
       * resto del ciclo lavorerebbe su campi vuoti e aprirebbe una scheda
       * senza contenuto.
       */
      if (!msg.message) {
        console.warn(
          `[${sessionId}] messaggio non decifrabile (attendo la riconsegna automatica)`,
          { da: String(msg.key.remoteJid || "").slice(0, 8) + "...", stub: msg.messageStubType }
        );
        return;
      }

      const testo = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
      const audioMsg = msg.message?.audioMessage || null;

      // Nota vocale: su WhatsApp rispondere a voce e' normale, e finora questi
      // messaggi venivano scartati qui dentro senza che nessuno lo sapesse. Il
      // cliente parlava e riceveva silenzio.
      //
      // I byte li scarichiamo noi e li consegniamo alla piattaforma, che ha la
      // configurazione della trascrizione: il microservizio non deve conoscere
      // ne' il fornitore STT ne' le sue chiavi.
      let audio = null;
      let audioTooLarge = false;
      if (!testo && audioMsg && !msg.key.fromMe) {
        // Tetto allineato al limite di 4,5 MB sul corpo delle richieste
        // serverless: in base64 i byte crescono di un terzo, quindi oltre
        // questa soglia la consegna fallirebbe comunque, e fallirebbe DOPO
        // aver scaricato il file.
        if ((audioMsg.fileLength || 0) > MAX_AUDIO_BYTES) {
          audioTooLarge = true;
        } else {
          try {
            const buffer = await downloadMediaMessage(msg, "buffer", {});
            if (buffer.length > MAX_AUDIO_BYTES) {
              audioTooLarge = true;
            } else {
              audio = {
                data: buffer.toString("base64"),
                mimeType: (audioMsg.mimetype || "audio/ogg").split(";")[0],
              };
            }
          } catch (error) {
            console.error("[audio] download non riuscito:", error.message);
            audioTooLarge = true;
          }
        }
      }

      /*
       * Senza testo e senza audio non c'e' nulla da qualificare.
       *
       * Ci finisce piu' roba di quanto sembri: una foto con didascalia (la
       * didascalia sta in `imageMessage.caption`, non in `conversation`), un
       * PDF, una posizione, un contatto, un sondaggio, una reazione. Sono
       * scarti legittimi — non sappiamo qualificarli — ma finora uscivano
       * muti, e da fuori erano indistinguibili da un messaggio mai arrivato.
       *
       * Il tipo va scritto nel log: e' l'unico modo per accorgersi che un
       * cliente sta mandando foto con la richiesta scritta sotto e non
       * riceve mai risposta.
       */
      if (!testo && !audio && !audioTooLarge) {
        const tipo = Object.keys(msg.message || {}).join(", ") || "sconosciuto";
        console.log(
          `[WEBHOOK IGNORATO]: messaggio senza testo ne' nota vocale su ${sessionId} (tipo: ${tipo})`
        );
        return;
      }

      const text = testo;

      // I messaggi scritti dall'agenzia si scartano, TRANNE i comandi.
      //
      // L'agente mette in pausa l'assistente scrivendo `!pausa` dentro la chat
      // col cliente: e' un messaggio `fromMe`, e con il filtro secco di prima
      // non sarebbe mai arrivato alla piattaforma. Passa solo cio' che comincia
      // con `!` ed e' una parola sola: tutto il resto che l'agente scrive al
      // cliente resta affar suo e non ci riguarda.
      const fromAgent = Boolean(msg.key.fromMe);
      const looksLikeCommand = /^![\p{L}\p{N}-]+$/u.test(text.trim());
      if (fromAgent && !looksLikeCommand) {
        // Messaggio scritto dall'agenzia al cliente: non e' un lead da
        // qualificare. Registrato e non solo saltato, perche' e' lo scarto
        // piu' frequente e il primo da escludere quando un messaggio di
        // prova non arriva in piattaforma.
        console.log(`[WEBHOOK IGNORATO]: messaggio in uscita dall'agenzia (fromMe) su ${sessionId}`);
        return;
      }

      // Si consegna il JID COMPLETO, dominio incluso.
      //
      // WhatsApp non identifica piu' tutti i contatti col numero di telefono:
      // per molte chat `remoteJid` e' un LID (`<id>@lid`), un identificativo
      // opaco. Tagliando via il dominio non si distingue piu' un numero da un
      // LID, e in risposta si finisce per costruire `<lid>@s.whatsapp.net`:
      // un indirizzo che non esiste, che Baileys accetta senza errore e che
      // non recapita nulla.
      //
      // `senderPn`, quando la libreria lo espone, contiene il numero vero
      // dietro al LID: e' l'unico modo di avere un recapito utilizzabile
      // dall'agenzia (richiamare, esportare nel gestionale).
      const jid = msg.key.remoteJid;
      const senderPn = msg.key.senderPn || msg.key.participantPn || null;
      const phoneFromPn = senderPn ? String(senderPn).split("@")[0] : null;
      const isLid = jid.endsWith("@lid");

      await notify({
        sessionId,
        event: "message",
        message: {
          // `from` resta il campo storico. Con un LID e senza `senderPn` non
          // abbiamo un numero: si manda comunque l'identificativo, perche' e'
          // cio' che tiene insieme la conversazione, ma il JID viaggia a
          // parte ed e' quello che conta per rispondere.
          from: phoneFromPn || jid.split("@")[0],
          jid,
          isLid,
          fromAgent,
          text,
          // Presenti solo per le note vocali: la piattaforma trascrive e usa
          // il testo, oppure risponde che non e' riuscita ad ascoltarle.
          ...(audio ? { audio } : {}),
          ...(audioTooLarge ? { audioTooLarge: true } : {}),
          profileName: msg.pushName || undefined,
        },
      });
    };

    for (const msg of messages) {
      try {
        await gestisciMessaggio(msg);
      } catch (error) {
        // Un messaggio storto non porta giu' quelli dopo di lui, ne' la
        // sessione. Il mittente e' troncato: nei log serve riconoscere la
        // conversazione, non conservare il recapito di una persona.
        console.error(`[${sessionId}] errore nel gestire un messaggio:`, error.message, {
          da: String(msg?.key?.remoteJid || "").slice(0, 8) + "...",
          tipo: msg?.message ? Object.keys(msg.message)[0] : "(non decifrato)",
        });
      }
    }
  });

  return entry;
}

app.post("/sessions/:id/connect", async (req, res) => {
  try {
    const entry = await startSession(req.params.id);

    // Il QR arriva in modo asincrono da Baileys: si attende qualche istante
    // invece di rispondere subito con null, che l'interfaccia mostrerebbe
    // come "codice non disponibile".
    for (let i = 0; i < 20 && !entry.qr && entry.status !== "connected"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (entry.status === "connected") {
      return res.json({ qrDataUrl: null, alreadyConnected: true });
    }

    if (!entry.qr) return res.status(504).json({ error: "qr_not_ready" });

    res.json({ qrDataUrl: entry.qr });
  } catch (error) {
    console.error("[connect] errore:", error.message);
    res.status(500).json({ error: "connect_failed", detail: error.message });
  }
});

app.get("/sessions/:id/status", (req, res) => {
  const entry = sessions.get(req.params.id);
  res.json({
    status: entry?.status ?? "disconnected",
    phoneNumber: entry?.phoneNumber ?? null,
  });
});

/**
 * Stato "sta scrivendo...".
 *
 * Separato dall'invio perche' i due momenti sono distinti: si annuncia la
 * digitazione, si aspetta, poi si manda. Un solo endpoint che facesse
 * entrambe le cose costringerebbe la piattaforma a tenere aperta la richiesta
 * per tutta l'attesa anche quando non le serve.
 *
 * Non e' un'operazione critica: se fallisce si risponde comunque 200 con
 * l'esito dentro, perche' chi chiama non deve avere motivo di interrompere
 * l'invio di un messaggio vero per un indicatore estetico.
 */
app.post("/sessions/:id/typing", async (req, res) => {
  const entry = sessions.get(req.params.id);
  if (!entry || entry.status !== "connected") {
    return res.status(409).json({ error: "session_not_connected" });
  }

  const { to, jid: providedJid, state } = req.body || {};
  const resolved = resolveSendJid({ to, jid: providedJid });
  if (!resolved) return res.status(400).json({ error: "missing_recipient" });

  try {
    // `subscribe` prima di `composing`: senza, alcuni client non mostrano
    // l'indicatore perche' non stanno osservando la presenza di quella chat.
    await entry.sock.presenceSubscribe(resolved);
    await entry.sock.sendPresenceUpdate(state === "paused" ? "paused" : "composing", resolved);
    res.json({ ok: true });
  } catch (error) {
    console.error("[typing] fallito:", error.message);
    res.json({ ok: false, error: "presence_failed" });
  }
});

app.post("/sessions/:id/send", async (req, res) => {
  const entry = sessions.get(req.params.id);
  if (!entry?.sock || entry.status !== "connected") {
    return res.status(409).json({ error: "not_connected" });
  }

  const { to, text, jid: providedJid } = req.body || {};
  if (!text) return res.status(400).json({ error: "invalid_payload" });

  const resolved = resolveSendJid({ to, jid: providedJid });
  if (!resolved.ok) {
    // 422 e non un invio tentato lo stesso: un indirizzo ricostruito male non
    // fa fallire Baileys, sparisce e basta. Meglio un errore che la
    // piattaforma vede e registra come [WA-SEND-ERROR].
    console.error("[send] destinatario non valido:", resolved.reason);
    return res.status(422).json({ error: "invalid_jid", detail: resolved.reason });
  }

  try {
    const inviato = await entry.sock.sendMessage(resolved.jid, { text });

    /*
     * Conservato per `getMessage`: se il telefono del cliente non riesce a
     * decifrare e chiede la riconsegna, Baileys ha bisogno del contenuto
     * originale. Senza, la richiesta di retry non puo' essere servita e il
     * cliente resta senza quel messaggio.
     *
     * Tetto a 200 voci per sessione: le richieste di retry arrivano entro
     * pochi minuti, e tenere tutto significherebbe far crescere la memoria
     * del servizio per l'intera durata di una sessione.
     */
    if (inviato?.key?.id) {
      if (entry.inviati.size >= 200) {
        entry.inviati.delete(entry.inviati.keys().next().value);
      }
      entry.inviati.set(`${resolved.jid}:${inviato.key.id}`, inviato.message);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("[send] errore:", error.message);
    res.status(502).json({ error: "send_failed", detail: error.message });
  }
});

app.delete("/sessions/:id", async (req, res) => {
  const entry = sessions.get(req.params.id);

  if (entry?.sock) {
    try {
      await entry.sock.logout();
    } catch {
      // Già disconnesso: la sessione va comunque rimossa.
    }
  }

  sessions.delete(req.params.id);

  // Distacco voluto dall'agenzia: le credenziali non servono piu' e, se
  // restassero, il prossimo abbinamento ripartirebbe da una sessione che
  // WhatsApp ha gia' chiuso.
  dimentica(req.params.id);
  await eliminaCredenziali(req.params.id, "distacco richiesto dalla piattaforma");

  res.json({ ok: true });
});

/*
 * L'ultima rete, sotto tutto il resto.
 *
 * Qui gira un socket per ogni agenzia collegata, dentro un processo solo. Una
 * promise rifiutata in un punto qualsiasi — una libreria che non gestisce un
 * caso, un timer che scatta su un socket gia' chiuso — con il comportamento
 * predefinito di Node termina il processo, e con lui cadono **tutte** le
 * sessioni: ogni agenzia deve riscansionare il QR per un errore che
 * riguardava una sola.
 *
 * Si registra e si prosegue. Non e' nascondere l'errore: la riga nei log c'e'
 * e nomina la sessione dove e' possibile. E' decidere che un guasto isolato
 * non merita di spegnere il servizio per tutti.
 *
 * `uncaughtException` e' diverso e si tratta diversamente: li' lo stato del
 * processo non e' piu' affidabile, quindi si registra e si esce davvero,
 * lasciando che Render riavvii con le sessioni ricaricate dal volume.
 */
process.on("unhandledRejection", (motivo) => {
  console.error("[PROCESSO] promise rifiutata senza gestore:", motivo?.message ?? motivo);
});

process.on("uncaughtException", (errore) => {
  console.error("[PROCESSO] eccezione non gestita, esco per farmi riavviare:", errore?.message ?? errore);
  process.exit(1);
});

app.listen(PORT, async () => {
  console.log(`whatsapp-service in ascolto sulla porta ${PORT}`);
  console.log(`sessioni in ${SESSIONS_DIR}`);
  if (!WEBHOOK) {
    // Ripetuto e in errore, non un avviso solo: all'avvio scorre via, e il
    // sintomo (nessun lead) si manifesta ore dopo.
    console.error("=".repeat(72));
    console.error("PLATFORM_WEBHOOK_URL NON IMPOSTATA.");
    console.error("Il servizio riceve i messaggi da WhatsApp ma NON li inoltra alla piattaforma.");
    console.error(`Impostala su Render a: ${WEBHOOK_ATTESO}`);
    console.error("=".repeat(72));
  } else {
    console.log(`webhook di destinazione: ${WEBHOOK}`);
  }

  // Prima si riaprono le sessioni gia' abbinate, poi si accende il giro di
  // sorveglianza: al contrario, il primo passaggio le troverebbe tutte giu'
  // e proverebbe a riaprirle in parallelo, che e' proprio cio' che il
  // ripristino scaglionato evita.
  await ripristinaSessioni();
  avviaSorveglianza();
  console.log(
    `sorveglianza attiva: controllo ogni ${INTERVALLO_SORVEGLIANZA_MS / 1000}s, ` +
      `allerta dopo ${SOGLIA_ALLERTA_MS / 60_000} minuti di sessione giu'`
  );
});

/**
 * Esportata per poterla provare.
 *
 * Il modulo è ESM e Render lo avvia con `node server.js`: questa riga non
 * cambia nulla per lui, e permette di esercitare la consegna verso la
 * piattaforma senza una sessione WhatsApp vera — l'unica parte di questo file
 * verificabile fuori dal campo.
 */
export { notify };
