# Variabili d'ambiente opzionali

Tre funzioni della piattaforma sono costruite come *seam*: senza configurazione
non spariscono e non lanciano errori, ripiegano su un comportamento più povero
ma corretto. Questo file elenca cosa attivano, e cosa succede finché restano
vuote.

Il criterio è sempre lo stesso: una chiave mancante è una configurazione da
completare, non un guasto. Un lead qualificato resta qualificato anche se
l'email non parte.

---

## Notifiche di lead caldo (email)

| Variabile | Esempio |
|---|---|
| `RESEND_API_KEY` | `re_...` |
| `NOTIFICATIONS_FROM_EMAIL` | `notifiche@propertytechsolutions.net` |

Quando un lead passa a `QUALIFIED`, l'agente assegnato — o il titolare, se non
c'è assegnazione — riceve un'email con nome, telefono, budget, zona, tempistica
e il link diretto alla scheda (`/leads?lead=<id>`).

**Senza le variabili**: `lib/notifications/email.ts` registra
`[notifications/email] Non configurato` e la conversazione prosegue intatta. Nei
log resta `[HOT-LEAD-NOTIFY]` con `outcome: "not_configured"`, quindi si vede
quante notifiche si sarebbero inviate.

**Residenza dei dati**: il corpo di queste email contiene dati personali di un
cliente dell'agenzia. Il fornitore va configurato con trattamento in UE
(CLAUDE.md §5); Resend espone la regione `eu-west-1` a questo scopo. Il modulo
parla l'API HTTP di Resend ma il contratto interno è minimo — destinatario,
oggetto, testo — quindi sostituirlo con Postmark, SES o un SMTP aziendale
significa riscrivere solo `deliver()`.

---

## Object storage per le foto degli immobili

| Variabile | Obbligatoria | Esempio |
|---|---|---|
| `STORAGE_BUCKET_URL` | sì | `https://<account>.r2.cloudflarestorage.com/<bucket>` |
| `STORAGE_ACCESS_KEY` | sì | — |
| `STORAGE_SECRET_KEY` | sì | — |
| `STORAGE_REGION` | no (`auto`) | `eu-central-1` per S3 |
| `STORAGE_PUBLIC_URL` | no | `https://cdn.tuodominio.it` |

Con le tre variabili obbligatorie presenti, il caricamento su `/properties`
scrive i byte sul bucket (PUT firmata SigV4) e salva in `Property.images`
l'**URL pubblico**. Senza, i byte restano nella tabella `PropertyImage` e
`images` contiene i percorsi della rotta `/api/images/[id]`.

`STORAGE_PUBLIC_URL` serve quando l'indirizzo da cui i portali scaricano è
diverso da quello di caricamento: su Cloudflare R2 è quasi sempre così — si
carica su `*.r2.cloudflarestorage.com` e si serve da un dominio collegato. Se
manca, si assume che il bucket sia leggibile all'indirizzo di caricamento.

**Il bucket dev'essere in UE** e pubblicamente leggibile in lettura: le foto le
scarica il crawler di Immobiliare.it, che non ha credenziali.

**Il passaggio non richiede una migrazione**: `Property.images` contiene URL, non
byte. Le foto già caricate continuano a essere servite dalla rotta locale, le
nuove finiscono sul bucket, e le due cose convivono senza che feed o interfaccia
se ne accorgano.

Se lo storage è configurato **ma rifiuta**, il caricamento risponde 502 invece
di ripiegare in silenzio sul database: mezzo archivio di qua e mezzo di là è un
problema che si scopre solo alla migrazione successiva.

---

## Collegamento WhatsApp via QR

| Variabile | Esempio |
|---|---|
| `WHATSAPP_SERVICE_URL` | `https://whatsapp-service.onrender.com` |
| `WHATSAPP_SERVICE_TOKEN` | segreto condiviso col microservizio |

Vedi `whatsapp-service/README.md`. Senza, l'interfaccia non propone il
collegamento via QR invece di offrire un pulsante che non può funzionare.

---

## Nota: gli inviti al team usano lo stesso seam

`RESEND_API_KEY` e `NOTIFICATIONS_FROM_EMAIL` servono anche all'email di invito
dei collaboratori (`/settings` → Team).

**Senza le variabili l'invito non si perde**: viene comunque creato e
l'interfaccia mostra il link da mandare a mano, com'era prima. È un ripiego
dichiarato, non il percorso normale — il token in chiaro esiste solo in quella
risposta, quindi senza il link quell'invito sarebbe irrecuperabile.

---

## Controlli pianificati (cron)

| Variabile | Serve a |
|---|---|
| `CRON_SECRET` | Autentica **entrambi** gli endpoint pianificati. Senza, rispondono 401 a chiunque. |

### `/api/cron/daily-checks` — registrato in `vercel.json`

Gira ogni mattina alle 6. Fa due cose: controlla gli incarichi in scadenza
(scaduti, entro 30 giorni, entro 60) e manda un riepilogo al titolare; poi
esegue un passaggio di promemoria appuntamento.

### `/api/cron/appointment-reminders` — **da pianificare fuori da Vercel**

Questo endpoint esiste ed è già protetto, ma **non è registrato in
`vercel.json`**, e non per dimenticanza.

I promemoria anti no-show cercano gli appuntamenti che cadono in una finestra
di **90 minuti** attorno al preavviso configurato (default 24 ore). È la
precisione che serve: un promemoria per una visita delle 9 va mandato alle 9
del giorno prima, non a un'ora qualsiasi.

Perché funzionino davvero l'endpoint va invocato **ogni ora**. Il piano Vercel
Hobby consente un solo giro al giorno per cron, quindi un giro giornaliero
intercetterebbe solo gli appuntamenti che capitano dentro quei 90 minuti —
cioè una piccola parte.

Due strade:

1. **Vercel Pro**: aggiungere la voce con `"schedule": "0 * * * *"` in
   `vercel.json`.
2. **Scheduler esterno** (cron-job.org, GitHub Actions, il cron di un server):
   chiamare ogni ora

   ```
   GET https://propertytechsolutions.net/api/cron/appointment-reminders
   Authorization: Bearer $CRON_SECRET
   ```

Finché non si fa nessuna delle due, i promemoria partono una volta al giorno
col giro di `daily-checks` e coprono solo una parte degli appuntamenti.
