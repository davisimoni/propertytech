import express from "express";
import QRCode from "qrcode";
import { describeSender, resolveSendJid } from "./jid.js";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} from "@whiskeysockets/baileys";

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
  if (bearer !== TOKEN) return res.status(401).json({ error: "unauthorized" });
  next();
});

async function notify(payload) {
  if (!WEBHOOK) return;

  try {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // Non blocca: la piattaforma interroga comunque /status mentre il QR è a
    // schermo, quindi un webhook perso non impedisce l'abbinamento. Impedisce
    // però la ricezione dei messaggi, quindi va guardato nei log.
    console.error("[notify] fallito:", error.message);
  }
}

async function startSession(sessionId) {
  const existing = sessions.get(sessionId);
  if (existing?.sock) return existing;

  const { state, saveCreds } = await useMultiFileAuthState(`${SESSIONS_DIR}/${sessionId}`);

  const entry = { sock: null, qr: null, status: "pending", phoneNumber: null };
  sessions.set(sessionId, entry);

  const sock = makeWASocket({ auth: state, printQRInTerminal: false });
  entry.sock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) entry.qr = await QRCode.toDataURL(qr);

    if (connection === "open") {
      entry.status = "connected";
      entry.qr = null;
      entry.phoneNumber = sock.user?.id?.split(":")[0] ?? null;
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
        setTimeout(() => startSession(sessionId), 3000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      // I gruppi restano fuori: la qualificazione riguarda conversazioni
      // uno-a-uno con un cliente.
      if (msg.key.remoteJid?.endsWith("@g.us")) continue;

      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
      if (!text) continue;

      // I messaggi scritti dall'agenzia si scartano, TRANNE i comandi.
      //
      // L'agente mette in pausa l'assistente scrivendo `!pausa` dentro la chat
      // col cliente: e' un messaggio `fromMe`, e con il filtro secco di prima
      // non sarebbe mai arrivato alla piattaforma. Passa solo cio' che comincia
      // con `!` ed e' una parola sola: tutto il resto che l'agente scrive al
      // cliente resta affar suo e non ci riguarda.
      const fromAgent = Boolean(msg.key.fromMe);
      const looksLikeCommand = /^![\p{L}\p{N}-]+$/u.test(text.trim());
      if (fromAgent && !looksLikeCommand) continue;

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
    console.warn("PLATFORM_WEBHOOK_URL non impostata: i messaggi in arrivo non verranno inoltrati.");
  }
});
