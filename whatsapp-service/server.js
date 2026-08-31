import express from "express";
import { timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { describeSender, resolveSendJid } from "./jid.js";
import {
  makeWASocket,
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
const PORT = process.env.PORT || 3000;

if (!TOKEN) {
  // Meglio non partire che partire aperto: chi raggiunge questo servizio può
  // scrivere ai clienti dell'agenzia a suo nome.
  throw new Error("SERVICE_TOKEN mancante: il servizio resterebbe aperto a chiunque.");
}

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

  const sock = makeWASocket({ auth: state, printQRInTerminal: false });
  entry.sock = sock;
  entry.starting = false;

  sock.ev.on("creds.update", saveCreds);


  sock.ev.on("connection.update", async (update) => {
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
      console.log(`[${sessionId}] disconnesso (codice ${code})`);
      await notify({ sessionId, event: "disconnected" });

      // Riconnessione automatica salvo logout esplicito dal telefono: con un
      // client non ufficiale la caduta è frequente e quasi sempre passeggera.
      if (code !== DisconnectReason.loggedOut) {
        sessions.delete(sessionId);
        const attesa = retryDelay(sessionId);
        console.log(`[${sessionId}] riprovo fra ${Math.round(attesa / 1000)}s`);
        setTimeout(() => startSession(sessionId), attesa);
      } else {
        // Logout esplicito dal telefono: la sessione non va riaperta, e il
        // contatore va azzerato o il prossimo abbinamento erediterebbe
        // l'attesa accumulata da quello precedente.
        retryCount.delete(sessionId);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      // I gruppi restano fuori: la qualificazione riguarda conversazioni
      // uno-a-uno con un cliente.
      if (msg.key.remoteJid?.endsWith("@g.us")) continue;

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

      // Senza testo e senza audio non c'e' nulla da qualificare.
      if (!testo && !audio && !audioTooLarge) continue;

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
        continue;
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
    await entry.sock.sendMessage(resolved.jid, { text });
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
  res.json({ ok: true });
});

app.listen(PORT, () => {
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
