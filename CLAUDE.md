# CLAUDE.md

Questo file fornisce contesto strategico e tecnico a Claude per tutte le sessioni di sviluppo su questo progetto. È la fonte di verità per architettura, moduli, modello di business e vincoli di conformità: va letto prima di proporre modifiche significative e mantenuto aggiornato quando le decisioni cambiano.

## Panoramica del Prodotto

Web App SaaS B2B rivolta alle **agenzie immobiliari italiane** ("AI Operations Assistant"). Automatizza le fasi critiche del workflow di un agente: qualificazione lead via WhatsApp, estrazione dati da documenti catastali/notarili, generazione di contenuti multi-canale per gli annunci e, per il piano Enterprise, trascrizione e reportistica automatica delle note vocali post-visita.

---

## 1. Visione del Prodotto & Design System

- **Target utenti**: agenzie immobiliari italiane e i loro agenti, spesso operativi sul campo (visite, sopralluoghi) più che alla scrivania.
- **Principi UI/UX**: interfaccia (GUI) estremamente pulita, minimalista e intuitiva, utilizzabile **senza necessità di formazione**. Supporto nativo a tema **scuro e chiaro**. Approccio **mobile-first**: la UI deve restare pienamente funzionale e leggibile da smartphone, dato l'uso frequente sul campo.
- **Tono di voce — due registri distinti, da non mescolare**:
  - **Verso l'agente** (landing, schermate di autenticazione, tutta la GUI, messaggi di errore): **forma "tu"**. È il nostro prodotto che parla al suo utente.
  - **Verso il cliente finale dell'agenzia** (messaggi WhatsApp ad acquirenti, promemoria appuntamento, report al proprietario): **forma di cortesia "lei"**. Qui non parliamo noi: parla l'agenzia, a un contatto che ha appena chiesto informazioni da un portale e che non conosce. È la norma del settore immobiliare italiano e va mantenuta anche nei testi di servizio (conferme, disdette, promemoria), non solo nel prompt dell'agente AI.
- **Stack Frontend**: Next.js (App Router), Tailwind CSS, Lucide Icons per l'iconografia, componenti Shadcn UI come base per elementi accessibili e coerenti.
- **Persistenza dati**: PostgreSQL via Prisma ORM.

---

## 2. Architettura & Stack Tecnologico

| Livello | Tecnologia |
|---|---|
| Frontend | Next.js (App Router), React, Tailwind CSS, Shadcn UI, Lucide Icons |
| Backend | Node.js / Next.js API Routes |
| Database | PostgreSQL |
| ORM | Prisma |
| Autenticazione & Sessioni | NextAuth.js v5 (Credentials provider, sessioni JWT) |
| Billing & Abbonamenti | Stripe Billing |
| AI — OCR/Parsing documenti & Chatbot WA | Anthropic Claude Opus 5 (`claude-opus-5`), structured outputs via Zod |
| Messaggistica | WhatsApp Cloud API / Twilio |

**Note architetturali:**
- Applicazione multi-tenant: ogni Agenzia immobiliare è una `Organization` isolata (vedi Sezione 4).
- Le API Routes fungono da unico punto di ingresso per logica di business, billing enforcement e integrazioni esterne — nessuna chiamata diretta a servizi esterni dal client.
- Le chiamate a Claude, Stripe e WhatsApp devono essere centralizzate in moduli/service layer dedicati (es. `lib/ai/`, `lib/billing/`, `lib/whatsapp/`) per favorire testabilità e gestione uniforme degli errori.

---

## 3. I 4 Moduli Core del Software

### Modulo 1 — AI WhatsApp Speed-to-Lead
Intercetta i lead in tempo reale dai portali immobiliari (Immobiliare.it, Idealista) tramite webhook o email parser. Il bot AI qualifica il potenziale acquirente via WhatsApp ponendo 3 domande chiave:
1. Necessità di mutuo?
2. Ha un immobile da vendere?
3. Tempistiche di acquisto?

Al termine della qualificazione, fissa un appuntamento direttamente in agenda.

**Lead Intelligence & Portafoglio Venditore.** Ogni lead porta con sé una stima del proprio portafoglio immobili (`Lead.ownedPropertiesCount`), da cui si deriva la categoria commerciale `SellerCategory`: `BUYER_ONLY` (Acquirente Puro), `SINGLE_SELLER` (Venditore Singolo), `MULTI_OWNER` (Investitore / Multi-Proprietario, da 2 immobili in su → "Alta Priorità / Lead Oro"). Il dato si popola da tre sorgenti, tutte accessorie al flusso principale:

1. **Conversazione** — riusa `mustSellFirst`, già estratto dalle 3 domande esistenti. **Il prompt e lo schema dell'agente AI non vanno modificati per questo**: la funzione legge un dato che passava di lì e andava perso, non ne chiede di nuovi.
2. **Incrocio con l'OCR (Modulo 2), con validazione umana obbligatoria** — vedi sotto.
3. **Inserimento manuale** dell'agente dalla scheda lead (`PATCH /api/whatsapp/leads/[id]/portfolio`).

Regole invarianti: `null` significa "non ancora rilevato" ed è diverso da `0` ("acquirente senza immobili da vendere"); la derivazione automatica **non abbassa mai** un conteggio inserito a mano; `sellerCategory` si ricava *sempre* da `ownedPropertiesCount` tramite `deriveSellerCategory()` in `lib/whatsapp/portfolio.ts` — è persistita solo per poter ordinare e filtrare lato database. L'arricchimento è non bloccante ovunque: un suo errore non deve mai far fallire né una conversazione né un'estrazione documentale già pagata a credito.

**Validazione match visura ↔ lead (anti-omonimia).** L'incrocio con l'OCR **non fonde mai i dati in automatico**: `lib/leads/portfolio-sync.ts` crea un `PortfolioMatch` in stato `PENDING` e si ferma lì. "Mario Rossi" nella visura e "Mario Rossi" fra i lead possono essere due persone diverse; attribuire d'ufficio un immobile a chi non ne è proprietario significa trattare un dato personale errato e mandare l'agente a proporre la vendita di una casa altrui. Finché il match è pendente la scheda mostra il conteggio come **"Da verificare"** e l'avviso con i tasti *Conferma e Unisci* / *Ignora / Omonimia* (`PATCH /api/whatsapp/portfolio-matches/[id]`). `ownedPropertiesCount` cambia **solo** in `confirmPortfolioMatch()`, in transazione con lo stato del match. Il vincolo unico `[leadId, propertyKey]` fa sì che ricaricare la stessa visura non riapra una decisione già presa, né confermata né ignorata.

**Promemoria anti no-show.** Per gli appuntamenti fissati dal bot, `lib/whatsapp/reminders.ts` invia un messaggio WhatsApp `reminderHoursBefore` ore prima (configurabile per agenzia su `WhatsAppConfig`, default 24). Lo scheduler esterno chiama `POST|GET /api/cron/appointment-reminders` con `Authorization: Bearer $CRON_SECRET`; la rotta è **fail-closed** — senza segreto configurato risponde 401 a chiunque. `Lead.reminderSentAt` è insieme traccia e guardia di idempotenza, ed è scritto **solo dopo un invio riuscito**, così un errore della Cloud API fa riprovare al giro successivo invece di considerare avvisato chi non ha ricevuto nulla. La risposta è interpretata da `parseReminderReply()`, **deterministica e mai affidata al modello**: liberare uno slot è irreversibile e non deve dipendere da come l'AI legge una frase. Riconosce solo risposte brevi e inequivocabili; se compaiono insieme un sì e un no, o la frase è incerta ("non lo so"), torna `null` e il messaggio prosegue nel flusso conversazionale normale. Su NO, lead e `CalendarSlot` si aggiornano in transazione: lo slot torna libero e la scheda segna "Ha disdetto". L'ordine di precedenza nel webhook è **opt-out → risposta al promemoria → AI**, e i promemoria non consumano crediti WhatsApp (la conversazione è già pagata; bloccarli per crediti esauriti farebbe saltare una visita già fissata).

**Integrazione gestionale / MLS.** `lib/integrations/crm-webhook.ts` inoltra il lead all'endpoint dell'agenzia (`Organization.crmWebhookUrl`) al passaggio in `QUALIFIED` — confrontando lo stato precedente, per non rispedirlo a ogni messaggio successivo. Il corpo è firmato HMAC-SHA256 con `crmWebhookSecret` nell'header `X-PropertyTech-Signature`: senza firma un webhook è un'API pubblica che accetta lead falsi da chiunque. Il segreto si genera alla prima configurazione e **non va rigenerato** ai salvataggi successivi, o si invalida la verifica già configurata sul gestionale. Ogni URL fornito dall'utente passa da `lib/net/safe-url.ts` (guardia SSRF condivisa con l'import annunci del Modulo 3 — **una sola copia delle regole**, sia al salvataggio sia alla consegna). La consegna non lancia mai: un gestionale offline non deve far fallire una conversazione. Restano l'export CSV (`/api/leads/export`, filtrabile per data, categoria e solo-qualificati) e il reinvio manuale dalla scheda lead.

**Connettori per gestionale (registro, non codice per ciascuno).** `lib/integrations/providers.ts` è la fonte di verità: per ogni gestionale dichiara **schema di autenticazione, nomi dei campi e host ammessi**, che sono le uniche tre cose che cambiano da un gestionale all'altro. `Organization.crmProvider` è una **stringa, non un enum Prisma**: aggiungere un gestionale non deve richiedere una migrazione del database per un dato che è solo un'etichetta, e i valori ignoti ripiegano su `webhook`.

- **`verified: true`** solo dove il contratto è realmente noto: webhook nostro (HMAC), Zapier, Make. **`verified: false`** per i preset dei gestionali italiani (Getrix, Gestim, Frimm): schema e mappatura sono precompilati secondo convenzione, ma **non sono contratti API confermati** — endpoint e chiave li rilascia il fornitore all'agenzia. Il flag guida un badge visibile nella UI. **Non inventare URL di endpoint**: un connettore che sembra configurato e non consegna è peggio di uno assente, perché nessuno va a controllare.
- **La mappatura è visibile e modificabile** dall'agenzia, e il test di connessione spedisce un lead finto **con la mappatura reale**: è ciò che rende utilizzabile un preset non confermato — l'errore si vede in cinque secondi in configurazione, non al primo lead vero. I valori di prova sono riconoscibili come finti (`PROVA — Mario Rossi (test)`), o qualcuno richiamerebbe un cliente inesistente.
- **Compatibilità all'indietro obbligatoria**: chi ha `crmProvider` a NULL riceve esattamente la forma storica — corpo annidato sotto `lead`, nomi originali, firma HMAC. `resolveFieldMap()` scarta le chiavi ignote, così una mappatura manomessa non può iniettare campi arbitrari nel corpo che spediamo.
- **Host vincolati** per i servizi a dominio noto (Zapier, Make), verificati **sia al salvataggio sia alla consegna** e con confronto su sottodominio esatto: `hooks.zapier.com.evil.test` non deve passare, e lì la firma HMAC non c'è a fare da rete.
- **Le credenziali sono cifrate** (AES-256-GCM, `lib/crypto/secrets.ts`, chiave da `ENCRYPTION_KEY` con ripiego su `NEXTAUTH_SECRET`). Una chiave API del gestionale in chiaro sarebbe leggibile da qualunque copia del database e permetterebbe di **scrivere** nel gestionale dell'agenzia. Non torna mai al browser: la UI ne mostra solo le ultime quattro cifre. Se la cifratura non è disponibile la rotta risponde 503 invece di salvare in chiaro.

### Fascicolo Documentale [piani a pagamento, NO Trial]

Archivio dei documenti di un incarico, agganciato al fascicolo di un **immobile** o di un **cliente** (`AgencyDocument`). Il valore non è l'archivio in sé — quello le agenzie ce l'hanno già su una cartella condivisa — ma le due cose che una cartella non fa: dire **cosa manca** prima del rogito (`PROPERTY_CHECKLIST` / `LEAD_CHECKLIST`) e **avvisare prima che un documento scada**.

Regole in `lib/documents/vault.ts`, modulo puro e senza database perché la stessa logica decide cosa si scrive al caricamento e cosa si mostra in scheda:

- **Conservazione decennale** (`RETENTION_YEARS = 10`), come impone l'art. 31 del D.Lgs. 231/2007 ai soggetti obbligati — e gli agenti immobiliari lo sono, per l'art. 3 c. 5 lett. d). `retentionUntil` è **calcolato all'acquisizione e persistito**, non derivato a ogni lettura: se la durata di legge cambia, i documenti già in archivio devono restare legati al termine vigente quando sono stati acquisiti.
- **Preavviso scadenze a 60 giorni** (`EXPIRY_WARNING_DAYS`), non 30: rifare un APE richiede settimane, e un avviso che arriva a rogito fissato è inutile. Il confronto è **per giorno di calendario**, non per istante, o un documento cambierebbe stato a seconda dell'ora in cui l'agente apre la pagina.
- Il campo scadenza compare **solo per i tipi che scadono davvero** (`hasExpiry`): chiederla per un atto di provenienza la farebbe compilare a caso, e una scadenza inventata è peggio di una assente.
- **Cancellazione**: il termine di conservazione non blocca — l'agenzia è titolare dei propri dati e può doverli cancellare su richiesta dell'interessato — ma richiede `?confirm=true`. Un clic sbagliato non porta via un documento che l'agenzia è tenuta a conservare; una decisione voluta passa senza ostacoli.

**Vincolo di storage, da rimuovere prima di un uso intensivo.** Non c'è object storage: il file è salvato in linea come data URI, con tetto a 5 MB (`MAX_FILE_BYTES`) e tipi limitati a PDF/JPEG/PNG/WebP — **niente SVG**, che il browser eseguirebbe. In lettura il tipo è **rivalidato**, non solo in scrittura, e servito con `Content-Disposition: attachment` + `nosniff`: contenuto caricato da un utente e restituito dalla nostra stessa origine è una XSS se lo si serve da eseguire. Regge la scansione singola, non l'archivio di un'agenzia a regime: prima del volume serve uno storage a oggetti **in UE**.

**Il paywall qui usa due forme, non una.** Una 402 al *caricamento* della scheda mostra un riquadro inline con l'upsell; il modal non chiudibile è riservato al *tentativo di salvare*. Un utente in prova che apre una chat non ha chiesto nulla: intrappolarlo in un modale senza X né Escape sarebbe una punizione per aver guardato.

**Cosa questo modulo NON è, e perché.** Non è uno strumento di conformità antiriciclaggio e non certifica nulla: la valutazione del rischio, la segnalazione alla UIF e la responsabilità di quanto dichiarato restano in capo al soggetto obbligato. Nel listino è annunciato come *"Fascicolo documentale con scadenze"* e non come *"Antiriciclaggio"*: venderlo come conformità esporrebbe l'agenzia a sanzioni fino a 50.000 € con la nostra promessa scritta come prova.

**Firma digitale: non implementata, e non implementabile in casa.** Sotto eIDAS una FEA richiede requisiti formali (per il DPCM 22/02/2013, polizza da almeno 500.000 € in capo a chi la eroga) e una FEQ un prestatore qualificato accreditato AgID — Namirial, Aruba, InfoCert, Yousign. **Si integra, non si costruisce**, con contratto commerciale e costo per firma. Costruire qualcosa che *sembra* una firma significherebbe far firmare mandati creduti opponibili, e scoprirlo in causa. Se si procederà, la strada è un seam agnostico rispetto al fornitore come quello STT in `lib/ai/transcription.ts`: senza configurazione risponde in modo chiaro invece di fingere.

### Modulo 2 — AI Document Extractor
Upload drag-and-drop di Visure Catastali, Atti notarili e Planimetrie. Usa le capacità multimodali di Claude per estrarre e strutturare in JSON:
- Dati anagrafici
- Quote di proprietà
- Comune, Foglio, Particella, Subalterno
- Rendita catastale
- Categoria catastale

### Modulo 3 — AI Multi-Channel Listing & Social Multiplier
A partire da dati strutturati o semplici punti elenco sull'immobile, genera automaticamente:
- Annuncio testuale per i portali immobiliari
- Post per Instagram/Facebook
- Script per video Reel/TikTok

### Modulo 4 — AI Voice Seller-Reporting Engine [ESCLUSIVO Piano Enterprise]
Trascrive le note vocali registrate dall'agente subito dopo una visita immobiliare e genera automaticamente un report strutturato da condividere con il proprietario dell'immobile (venditore).

*Nota architetturale*: la trascrizione richiede uno step di Speech-to-Text a monte (es. Whisper API o servizio equivalente); Claude si occupa della strutturazione, sintesi e formattazione del report finale a partire dal testo trascritto.

*Stato implementazione*: il seam STT è in `lib/ai/transcription.ts` ed è agnostico rispetto al provider — accetta qualsiasi endpoint compatibile OpenAI-Whisper via `STT_API_URL` / `STT_API_KEY`. Senza queste variabili il percorso audio risponde **503** con messaggio azionabile; il percorso **testuale è pienamente funzionante** e non richiede configurazione.

---

## 4. Modello di Monetizzazione & Monitoraggio Utilizzo

### Piani

| Piano | Prezzo | Conversazioni WA/mese | OCR Documenti | Postazioni | Agende | Fascicolo documentale | Social Multiplier | Voice Seller-Reporting | Reportistica avanzata |
|---|---|---|---|---|---|---|---|---|---|
| **Trial** | Gratuito | 15 (totali, non mensili) | 5 estratti | 1 | — | ❌ | ❌ | ❌ | ❌ |
| **Starter** | 99 €/mese | 150 | Illimitato | 1 | 1 | ✅ | ❌ | ❌ | ❌ |
| **Professional** | 279 €/mese | 500 | Illimitato | 5 | 3 | ✅ | ❌ | ❌ | ❌ |
| **Enterprise** | 499 €/mese | 2.500 (extra a 0,05€/chat) | Illimitato | 20 | Illimitate | ✅ | ✅ | ✅ | ✅ |

- Il Trial non richiede carta di credito.
- Il Social Multiplier (Modulo 3) e il Voice Seller-Reporting Engine (Modulo 4) sono **sbloccati esclusivamente** nel piano Enterprise.
- Le **postazioni** (`seatsLimit` in `lib/plans.ts`) sono le persone che possono accedere per quell'agenzia. Il controllo è in `POST /api/team` e conta **anche gli inviti non ancora accettati**: altrimenti basterebbe generarne dieci di fila per superare il limite. Verificato prima di creare l'invito, non dopo. Il piano da suggerire è calcolato — Starter ha una postazione come il Trial, quindi il salto utile è Professional.
- Il **Fascicolo documentale** è escluso dal Trial: promettere una conservazione decennale su un account di prova che può sparire in due settimane non ha senso.

### Middleware Paywall — Enforcement dei Limiti

Quando una `Organization` supera i limiti del proprio piano:
- Le API devono restituire **HTTP 402 Payment Required**, con un payload che indichi la risorsa esaurita (es. `{ "error": "usage_limit_exceeded", "resource": "wa_conversations" }`).
- La UI deve intercettare il 402 e mostrare un **Modal non chiudibile** (nessuna X, nessun click-outside-to-dismiss, nessun ESC) che reindirizza al Checkout Stripe per upgrade o pagamento.
- Il conteggio dell'utilizzo (conversazioni WA, estrazioni documento) deve essere tracciato per `Organization` e verificato **prima** di eseguire l'azione consumante risorse (fail-closed, non fail-open), per evitare overshoot oltre il limite del piano.

**Due tipi di gate, stesso status HTTP:**
- **A crediti** (`checkUsageLimit` in `lib/usage.ts`) — WhatsApp, OCR documenti, note vocali. Payload: `{ "error": "usage_limit_exceeded", "resource": "..." }`.
- **Per piano** (`checkFeatureAccess` in `lib/feature-access.ts`) — Social Multiplier e Voice Seller-Reporting, sbloccati solo su Enterprise e senza contatore. Payload: `{ "error": "feature_not_in_plan", "resource": "...", "requiredPlan": "..." }`.

Entrambi restituiscono **402**, così la UI li intercetta con un unico gestore; il campo `error` distingue il messaggio da mostrare nel modal.

---

## 5. Conformità GDPR & Sicurezza Dati (MANDATORIA)

Questi vincoli sono non negoziabili e vanno rispettati in ogni implementazione, anche quando non esplicitamente richiamati nel singolo task.

- **Data Residency**: Data center e database esclusivamente in Unione Europea (es. regione `eu-central-1` / Francoforte). Nessun provider o servizio terzo che processi dati personali fuori UE senza adeguate garanzie (SCC, adequacy decision).
  - **Il vincolo riguarda anche il calcolo, non solo il database.** Su Vercel la regione di esecuzione delle funzioni è fissata a `fra1` in `vercel.json`: senza quel pin le funzioni girano nella regione di default (`iad1`, Virginia) e ogni query — nomi dei lead, telefoni, codici fiscali estratti dalle visure — verrebbe elaborata negli Stati Uniti pur con il database a Francoforte. È anche la scelta più veloce, perché elimina due traversate atlantiche per query.
- **Consenso WhatsApp**: Il primo messaggio automatico inviato dal bot a un nuovo contatto deve includere l'informativa privacy breve e l'opzione di opt-out esplicita (es. *"Rispondi STOP per cancellarti"*). L'opt-out deve essere immediatamente efficace e persistito per quel contatto.
- **Isolamento Dati Multi-Tenant**: Ogni Agenzia (`Organization`) deve poter accedere **solo ed esclusivamente** ai propri dati (lead, clienti, documenti catastali). Ogni tabella contenente dati di tenant deve avere una colonna `organizationId` e ogni query deve filtrare rigidamente su questo campo — mai fare affidamento solo su controlli a livello applicativo/UI. Preferire l'enforcement a livello di query/repository layer (o Row-Level Security su PostgreSQL, se disponibile) rispetto a controlli sparsi nei singoli endpoint.
- **Segreti di terze parti cifrati a riposo**: token di accesso WhatsApp (`WhatsAppConfig.metaAccessToken`) e chiavi API dei gestionali (`Organization.crmAuthToken`) sono cifrati con AES-256-GCM da `lib/crypto/secrets.ts`. Non è una precauzione teorica: quel token **invia messaggi a nome dell'agenzia** ai suoi clienti, e in chiaro sarebbe leggibile da qualunque copia del database. Il confine di cifratura WhatsApp sta tutto in `lib/whatsapp/credentials.ts` — sparpagliare `decryptSecret` sui singoli punti di lettura significa che al successivo qualcuno dimentica. Un valore **non cifrato viene rifiutato**, non usato come ripiego: altrimenti la protezione sarebbe aggirabile ripristinando un backup precedente. `hasUsableAccessToken()` e non `Boolean(token)`, o una connessione rotta risulterebbe a posto mentre ogni invio fallisce.
- **Mascheramento Dati Sensibili**: Nessun dato di carte di credito deve mai transitare o essere persistito nei nostri database. Delegare interamente a Stripe (Stripe Elements/Checkout, tokenizzazione), salvando al massimo riferimenti opachi (es. `stripeCustomerId`, `stripeSubscriptionId`).
- **Disclaimer sugli output AI**: ogni output generato dall'AI che l'agente può mostrare o inoltrare a terzi (estrazione documentale, report al proprietario, contenuti social) deve riportare `AI_DISCLAIMER` da `lib/compliance.ts`. Il disclaimer **non va nascosto in stampa**: il PDF del report è proprio il documento che esce dall'agenzia. Nei messaggi WhatsApp è aggiunto lato server all'invio, non demandato al prompt del modello.
- **Accordo sul trattamento (DPA)**: l'agenzia accetta l'accordo ex art. 28 GDPR alla registrazione. Si registrano **istante e versione** (`dpaAcceptedAt`, `dpaAcceptedVersion`), non un booleano: revisionando il testo, senza versione non sarebbe dimostrabile quale accordo sia stato accettato. Gli account creati via OAuth non passano dal form: devono accettare esplicitamente dalla Dashboard, e il provisioning **non deve mai precompilare** quei campi.
- **Dati Vocali (Modulo 4 — Note Vocali)**: le registrazioni audio possono contenere dati personali di terzi (venditori, acquirenti) e vanno trattate come dato sensibile. Conservare l'audio grezzo solo per il tempo necessario a generare il report, poi eliminarlo mantenendo la sola trascrizione testuale; storage e processing esclusivamente in UE, coerentemente con la Data Residency.

---

## 6. Linee Guida di Codifica & Style Guide

- **TypeScript rigoroso**: `strict` mode attivo, tipizzazione esplicita su input/output di funzioni pubbliche e su tutti i payload API. Evitare `any`; preferire tipi derivati da Prisma/Zod.
- **Componenti UI**: puliti, modulari, accessibili (attributi ARIA, contrasto colori, navigazione da tastiera) e responsive con approccio **mobile-first**, poiché una parte significativa degli agenti immobiliari utilizza l'app sul campo da smartphone.
- **Gestione errori su API esterne**: ogni chiamata a Stripe, Anthropic Claude e WhatsApp Cloud API / Twilio deve prevedere:
  - Timeout e retry ragionati dove appropriato (idempotenza per Stripe).
  - Gestione esplicita di errori/timeout con fallback chiari e comprensibili per l'utente finale (mai esporre stack trace o errori tecnici grezzi in UI).
  - Logging strutturato lato server per debugging, senza loggare dati sensibili o PII non necessari.

---

## Come usare questo documento

Consulta questo file all'inizio di ogni sessione di lavoro su questo progetto per allinearti su architettura, moduli, piani tariffari e vincoli di conformità. Se una decisione qui descritta cambia (es. prezzi dei piani, stack tecnologico, requisiti GDPR), aggiorna questo file nello stesso commit/PR che introduce la modifica.
