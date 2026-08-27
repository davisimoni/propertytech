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

## I file del servizio

Sono già in questa cartella, versionati insieme al resto del progetto:

- `package.json` — dipendenze e comando di avvio
- `server.js` — il servizio completo

Non c'è nulla da copiare a mano: Render li prende dal repository.

---

## Deploy su Render

La configurazione è in **`render.yaml`** nella radice del repository, quindi
non serve impostare nulla dalla dashboard.

1. Su [render.com](https://render.com) → **New → Blueprint** → collega il repo.
   Render legge `render.yaml` e propone il servizio già configurato: piano,
   comandi, volume su `/data` e regione Francoforte.
2. L'unica variabile da inserire a mano è **`SERVICE_TOKEN`** (le altre sono
   già nel file): genera un segreto lungo e casuale.
3. A deploy fatto, su **Vercel** aggiungi:

   | Variabile | Valore |
   |---|---|
   | `WHATSAPP_SERVICE_URL` | l'URL del servizio Render |
   | `WHATSAPP_SERVICE_TOKEN` | lo **stesso** valore di `SERVICE_TOKEN` |

   Poi **ridistribuisci**: le variabili nuove non entrano in vigore sui
   deployment esistenti.

Preferendo la creazione manuale (New → Web Service invece di Blueprint), le
impostazioni da replicare sono: build `cd whatsapp-service && npm install`,
start `cd whatsapp-service && node server.js`, health check `/health`, un
**Disk** montato su `/data`, e le tre variabili d'ambiente.

Su Railway il procedimento è analogo: New Project → Deploy from repo → Volume
su `/data` → stesse variabili.

> **Il piano gratuito di Render non va bene.** Sospende il servizio dopo
> qualche minuto di inattività, e con esso cade il socket: le agenzie
> risulterebbero scollegate a intermittenza. `render.yaml` imposta già
> `starter`.

> **Il volume su `/data` è indispensabile.** Baileys ci scrive le credenziali
> di sessione: senza, si perdono a ogni riavvio o nuovo deploy e **tutte** le
> agenzie collegate devono rifare la scansione del QR.

---

## Il codice

Sta in [`server.js`](./server.js), non riprodotto qui: due copie dello stesso
file divergono alla prima modifica, e quella dimenticata diventa la fonte di
un problema difficile da spiegare.

In sintesi cosa fa: una sessione Baileys per agenzia, credenziali su disco in
`SESSIONS_DIR`, riconnessione automatica salvo logout esplicito dal telefono,
inoltro alla piattaforma dei messaggi uno-a-uno (esclusi gruppi e messaggi
inviati da noi), e `/health` esposta **prima** dell'autenticazione perché
Render la interroga senza credenziali.

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
