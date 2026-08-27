# Microservizio di collegamento WhatsApp (QR)

Tiene aperto il socket verso WhatsApp per conto di PropertyTech e permette
l'abbinamento inquadrando un QR, come su WhatsApp Web.

Vive **fuori da Vercel**: l'abbinamento richiede una connessione persistente e
uno stato di sessione che sopravvive fra un messaggio e l'altro, mentre le
funzioni serverless sono senza stato, durano al massimo un minuto e girano in
istanze che non condividono memoria.

---

## ⚠️ Da leggere prima di attivarlo

Baileys è un **client non ufficiale**: si collega a WhatsApp fingendosi
WhatsApp Web. WhatsApp non lo autorizza e **può bannare i numeri che lo
usano**, senza preavviso né appello.

Per un'agenzia immobiliare quel numero è il centralino: un ban le blocca il
lavoro, e la responsabilità ricadrebbe sulla piattaforma che gliel'ha fatto
collegare. Vale la pena dirlo in fase di attivazione, non dopo.

Riduce il rischio, senza azzerarlo: usare un numero dedicato e non quello
principale dell'agenzia; non inviare messaggi in massa; rispettare ritmi
umani fra un invio e l'altro.

L'alternativa senza questo rischio è **WhatsApp Cloud API di Meta**, già
integrata nella piattaforma: è il canale ufficiale, ma richiede la verifica
Business.

---

## Il contratto

Quattro chiamate, definite da noi e implementate qui. Chi preferisce Evolution
API o un altro gestore lo mette dietro questo stesso contratto con un
adattatore sottile: l'applicazione non cambia di una riga.

Tutte richiedono `Authorization: Bearer <WHATSAPP_SERVICE_TOKEN>`.

| Metodo | Percorso | Risposta |
|---|---|---|
| `POST` | `/sessions/:id/connect` | `{ "qrDataUrl": "data:image/png;base64,…" }` |
| `GET` | `/sessions/:id/status` | `{ "status": "pending\|connected\|disconnected", "phoneNumber": "39…" \| null }` |
| `POST` | `/sessions/:id/send` | `{ "ok": true }` — corpo `{ "to": "39…", "text": "…" }` |
| `DELETE` | `/sessions/:id` | `{ "ok": true }` |

In più il servizio **chiama** la piattaforma su
`POST https://propertytechsolutions.net/api/whatsapp/qr/webhook`, con lo
stesso Bearer, quando succede qualcosa:

```json
{ "sessionId": "org-…", "event": "connected", "phoneNumber": "39…" }
{ "sessionId": "org-…", "event": "disconnected" }
{ "sessionId": "org-…", "event": "message",
  "message": { "from": "39…", "text": "Buongiorno…", "profileName": "Mario" } }
```

Il webhook non è indispensabile per l'abbinamento — la scheda interroga anche
`/status` mentre il QR è a schermo — ma **serve per ricevere i messaggi**:
senza, l'AI non risponde a nessuno.

---

## Deploy su Render (il più rapido)

1. Metti i due file qui sotto in un repository.
2. Su [render.com](https://render.com) → **New → Web Service** → collega il repo.
3. Runtime **Node**, build `npm install`, start `npm start`.
4. Aggiungi un **Disk** montato su `/data` (1 GB basta).
   Senza, le credenziali di sessione si perdono a ogni riavvio e tutte le
   agenzie devono rifare la scansione.
5. Variabili d'ambiente:

   | Variabile | Valore |
   |---|---|
   | `SERVICE_TOKEN` | un segreto lungo e casuale |
   | `PLATFORM_WEBHOOK_URL` | `https://propertytechsolutions.net/api/whatsapp/qr/webhook` |
   | `SESSIONS_DIR` | `/data/sessions` |

6. A deploy fatto, su **Vercel** aggiungi:

   | Variabile | Valore |
   |---|---|
   | `WHATSAPP_SERVICE_URL` | l'URL del servizio Render |
   | `WHATSAPP_SERVICE_TOKEN` | lo **stesso** valore di `SERVICE_TOKEN` |

   Poi **ridistribuisci**: le variabili nuove non entrano in vigore sui
   deployment esistenti.

Su Railway il procedimento è identico: New Project → Deploy from repo →
Volume su `/data` → stesse variabili.

> **Il piano gratuito di Render non va bene.** Sospende il servizio dopo
> qualche minuto di inattività, e con esso cade il socket: le agenzie
> risulterebbero scollegate a intermittenza. Serve un piano che tenga il
> processo sempre acceso.

---

## `package.json`

```json
{
  "name": "propertytech-whatsapp-service",
  "private": true,
  "type": "module",
  "scripts": { "start": "node server.js" },
  "dependencies": {
    "@whiskeysockets/baileys": "^6.7.9",
    "express": "^4.21.2",
    "qrcode": "^1.5.4"
  }
}
```

## `server.js`

```js
import express from "express";
import QRCode from "qrcode";
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";

const app = express();
app.use(express.json());

const TOKEN = process.env.SERVICE_TOKEN;
const WEBHOOK = process.env.PLATFORM_WEBHOOK_URL;
const SESSIONS_DIR = process.env.SESSIONS_DIR || "./sessions";

if (!TOKEN) throw new Error("SERVICE_TOKEN mancante: il servizio resterebbe aperto a chiunque.");

// Una sessione per agenzia, tenuta in memoria e ricostruita all'avvio dal disco.
const sessions = new Map();

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
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // Non blocca: la piattaforma interroga comunque /status mentre il QR e'
    // a schermo, quindi un webhook perso non impedisce l'abbinamento.
    console.error("[notify] fallito", error.message);
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
      await notify({ sessionId, event: "connected", phoneNumber: entry.phoneNumber });
    }

    if (connection === "close") {
      entry.status = "disconnected";
      const code = lastDisconnect?.error?.output?.statusCode;
      await notify({ sessionId, event: "disconnected" });

      // Riconnessione automatica salvo logout esplicito dal telefono: la
      // caduta e' frequente e quasi sempre passeggera.
      if (code !== DisconnectReason.loggedOut) {
        sessions.delete(sessionId);
        setTimeout(() => startSession(sessionId), 3000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      // Si ignorano i messaggi inviati da noi e quelli dei gruppi: la
      // qualificazione riguarda conversazioni uno-a-uno con un cliente.
      if (msg.key.fromMe || msg.key.remoteJid?.endsWith("@g.us")) continue;

      const text =
        msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
      if (!text) continue;

      await notify({
        sessionId,
        event: "message",
        message: {
          from: msg.key.remoteJid.split("@")[0],
          text,
          profileName: msg.pushName || undefined,
        },
      });
    }
  });

  return entry;
}

app.post("/sessions/:id/connect", async (req, res) => {
  const entry = await startSession(req.params.id);

  // Il QR arriva in modo asincrono da Baileys: si attende qualche istante
  // invece di rispondere subito con null, che l'interfaccia mostrerebbe come
  // "codice non disponibile".
  for (let i = 0; i < 20 && !entry.qr && entry.status !== "connected"; i++) {
    await new Promise((r) => setTimeout(r, 250));
  }

  if (entry.status === "connected") return res.json({ qrDataUrl: null, alreadyConnected: true });
  if (!entry.qr) return res.status(504).json({ error: "qr_not_ready" });

  res.json({ qrDataUrl: entry.qr });
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

  const { to, text } = req.body || {};
  if (!to || !text) return res.status(400).json({ error: "invalid_payload" });

  await entry.sock.sendMessage(`${String(to).replace(/\D/g, "")}@s.whatsapp.net`, { text });
  res.json({ ok: true });
});

app.delete("/sessions/:id", async (req, res) => {
  const entry = sessions.get(req.params.id);
  if (entry?.sock) {
    try {
      await entry.sock.logout();
    } catch {
      // Gia' disconnesso: la sessione va comunque rimossa.
    }
  }
  sessions.delete(req.params.id);
  res.json({ ok: true });
});

app.listen(process.env.PORT || 3000, () => console.log("whatsapp-service in ascolto"));
```

---

## Verifica dopo il deploy

```bash
# 1. Il servizio risponde e l'autenticazione funziona
curl -s -o /dev/null -w "%{http_code}\n" https://IL-TUO-SERVIZIO/sessions/prova/status
# atteso: 401  (senza token)

curl -s -H "Authorization: Bearer IL_TUO_TOKEN" \
  https://IL-TUO-SERVIZIO/sessions/prova/status
# atteso: {"status":"disconnected","phoneNumber":null}
```

Poi, dalla piattaforma: **Qualifica Lead → Connetti WhatsApp con QR Code**. Il
codice compare entro pochi secondi; inquadrandolo da *WhatsApp → Dispositivi
collegati*, la scheda passa a **Connesso** col numero abbinato.

Se il QR non compare, i log del servizio dicono il perché — il caso più
frequente è il volume su `/data` non montato, con le credenziali che non si
riescono a scrivere.

---

## Cosa non è ancora coperto

- **Note vocali e media in arrivo**: il servizio inoltra solo il testo. Gli
  altri tipi vanno gestiti come già fa il webhook Meta.
- **Un solo processo**: le sessioni stanno in memoria, quindi non si può
  scalare su più istanze senza uno stato condiviso.
- **Nessun limite di invio**: la protezione dai ritmi che insospettiscono
  WhatsApp va aggiunta prima di usarlo su volumi reali.
