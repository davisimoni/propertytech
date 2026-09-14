# Sales Playbook & Training Manual — PropertyTech

**Uso interno. Non consegnare al cliente.**
Versione 2.0 — settembre 2026

> Ogni numero sul prodotto e ogni affermazione tecnica in questo manuale è verificata contro il codice in produzione. I dati di mercato sono attribuiti alla fonte: dove non c'è una fonte, è scritto che si tratta di un ordine di grandezza da far confermare al cliente.
>
> La sezione **§5 "Cosa NON promettere"** è la più importante del documento: una promessa che il prodotto non mantiene si paga all'onboarding, quando il cliente ha già firmato e si sente preso in giro.

### Indice

**PARTE I — IL PRODOTTO**
1. Executive Summary
2. Analisi delle funzionalità
3. Gestione delle obiezioni
4. I punti di forza invisibili
5. Cosa NON promettere

**PARTE II — IL MERCATO (parlare da pari)**
6. Glossario rapido
7. Academia Immobiliare

**PARTE III — TROVARE E CHIUDERE CLIENTI**
8. Strategia di acquisizione (Go-to-Market)
9. Prospection: trovare e mappare le agenzie
10. Promemoria per la prima call

---
---

# PARTE I — IL PRODOTTO

## 1. Executive Summary

### Cos'è PropertyTech

Un assistente operativo AI per agenzie immobiliari italiane. Non è un gestionale e non vuole sostituirlo: si occupa delle attività che rubano tempo all'agente **fuori** dal gestionale — rispondere ai lead dei portali, leggere visure e perizie, scrivere annunci, preparare i report post-visita, tenere aggiornati i portali.

### La promessa di valore, in una frase

> **Fa in pochi secondi, e da solo, il lavoro che oggi l'agente rimanda a stasera.**

Le tre cose che questa frase contiene, e che vanno dette in questo ordine:

1. **Velocità** — il primo contatto con un lead arriva in pochi secondi, anche quando l'agente è in visita. Chi risponde per primo chiude: il secondo trova un cliente che ha già parlato con qualcun altro.
2. **Continuità** — non si stanca il venerdì sera. La perizia di 90 pagine, il report al proprietario, l'annuncio per tre canali: sono i compiti che si accumulano e che nessuno ha voglia di fare a fine giornata.
3. **Zero formazione** — nessun prompt da scrivere, nessun corso. Caricamenti, tendine, pulsanti. Se serve un manuale, abbiamo sbagliato noi.

### Il target

**Chi compra:** il **titolare** di un'agenzia da 1 a 10 agenti. È lui che paga, che sente il costo di un lead perso e che risponde dei dati dei clienti.

**Chi usa:** gli **agenti**, spesso da smartphone, fra una visita e l'altra. Se non lo usano loro, il titolare disdice al secondo mese: è il vero rischio di churn, e per questo l'interfaccia è mobile-first.

**Chi NON è il nostro cliente (oggi):**
- reti franchising con IT centralizzato e strumenti imposti dalla casa madre;
- agenzie che non lavorano i portali (solo passaparola): senza lead in ingresso, metà del valore non si attiva;
- agenzie fuori dall'Italia: parser dei portali, terminologia catastale e tracciati sono tarati sul mercato italiano.

### Il listino, in sintesi

| | Trial | Starter | Professional | Enterprise |
|---|---|---|---|---|
| **Prezzo** | gratis | 99 €/mese | 279 €/mese | 499 €/mese |
| Conversazioni WhatsApp | 15 *totali* | 150/mese | 500/mese | 2.500/mese, poi 0,05 €/chat |
| Estrazioni documenti | 5 | illimitate | illimitate | illimitate |
| Analisi perizie (Aste) | — | 5/mese | 25/mese | 100/mese |
| Postazioni | 1 | 1 | 3 | **illimitate** |
| Agende | — | 1 | 3 | illimitate |
| Fascicolo documentale | — | ✅ | ✅ | ✅ |
| Social & Annunci | — | — | — | ✅ |
| Report Vocali | — | — | — | ✅ |

Il Trial **non chiede la carta di credito**. Dillo sempre: toglie l'attrito principale alla prima call.

---

## 2. Analisi delle funzionalità

Per ogni modulo: **come funziona davvero**, il **pain** che risolve, il **pitch** da usare col titolare.

---

### 2.1 Qualifica Lead — Inbound Email Parsing + Bot WhatsApp

#### Come funziona

Il cliente scrive dal portale (Immobiliare.it, Idealista, Casa.it). L'agenzia imposta **una regola di inoltro** dalla propria casella verso un indirizzo dedicato: cinque minuti di configurazione, senza chiedere niente al portale.

Da lì:

1. **Lettura a regole.** Un parser deterministico riconosce il formato dei tre portali italiani ed estrae nome, telefono, riferimento immobile e messaggio. Nessuna AI: su un'email a forma fissa una regola non sbaglia mai, costa zero e risponde in un millisecondo.
2. **Ripiego AI.** Se le regole non riconoscono il formato — un portale straniero, il modulo di un sito scritto in prosa — entra un modello leggero che estrae gli stessi campi. Copre il mondo senza mettere l'AI sul percorso principale.
3. **Se non si capisce, si avvisa.** Se nessuno dei due trova un recapito, **il titolare riceve una email**: "è arrivata una richiesta non riconosciuta, guarda in casella". Nessun contatto sparisce in silenzio.
4. **Ingaggio.** Il bot scrive su WhatsApp in pochi secondi, qualifica il contatto (mutuo o liquidità, immobile da vendere, tempistiche, zona, budget) e **propone gli slot liberi dell'agenda**, fissando l'appuntamento.
5. **Promemoria anti no-show** il giorno prima. Se il cliente risponde "no", lo slot torna libero e la scheda segna la disdetta.

#### Il Pain

> *"I lead dei portali arrivano mentre sono in visita. Rispondo la sera, e metà volte hanno già trovato l'agenzia che ha risposto per prima."*

E il pain nascosto, che fa più male quando lo nomini: **l'agenzia paga il portale per quei lead.** Ogni lead non lavorato è denaro già speso e buttato.

#### Il Pitch

> *"Lei per i lead di Immobiliare.it paga già. La domanda non è se rispondere: è **quanto ci mette**. Oggi il suo agente risponde quando esce dalla visita — due, tre ore dopo. Noi rispondiamo in pochi secondi, qualifichiamo il contatto con quattro domande e le mettiamo l'appuntamento in agenda. Lei la mattina dopo non trova venti richieste da smistare: trova le visite già fissate e i contatti ordinati per priorità.*
>
> *E se un giorno un portale cambia il formato delle email, non perde niente in silenzio: il sistema le scrive per dirle che è arrivata una richiesta che non ha saputo leggere."*

**Prova di solidità se il cliente è tecnico:** il sistema rifiuta di trasformare in "numero di telefono" una partita IVA, un codice fiscale, un codice pratica o il fax nel piè di pagina — errori che altrove fanno partire messaggi WhatsApp verso il nulla a nome dell'agenzia.

---

### 2.2 Feed XML — Sincronizzazione con i portali

#### Come funziona

Un **unico indirizzo** che l'agenzia consegna al portale. Da lì il portale rilegge il portafoglio da solo, di norma una o due volte al giorno.

Cosa esce dal feed, e soprattutto **cosa non esce**:

- escono solo gli immobili **"In vendita"** e **"Sotto proposta"**;
- **non escono** bozze, venduti e archiviati;
- **non escono** gli immobili con **incarico scaduto** — senza mandato valido l'agenzia non ha titolo per pubblicizzarli;
- il **CAP** è nel tracciato (i portali lo richiedono) e la scheda avvisa quando manca su un immobile pubblicato.

L'indirizzo contiene una chiave riservata da 192 bit. Se viene divulgato, il titolare lo **rigenera con un clic**: il nuovo funziona subito, senza finestre in cui il feed resta muto.

#### Il Pain

> *"Ogni volta che cambio un prezzo devo rifare l'annuncio su tre portali. E una volta è rimasto online per settimane un appartamento già venduto — ci ho fatto una figura pessima con il cliente che ha chiamato per vederlo."*

#### Il Pitch

> *"Lei aggiorna il prezzo una volta, qui. I portali si aggiornano da soli.*
>
> *Ma la cosa che le risparmia la brutta figura è un'altra: dal feed escono **solo** gli immobili che ha marcato in vendita. Una bozza non finisce online per sbaglio, un venduto sparisce, e un immobile il cui incarico è scaduto esce dalla pubblicazione da solo — perché pubblicizzare senza mandato espone lei, non noi."*

---

### 2.3 Report Venditori da Note Vocali *(Enterprise)*

#### Come funziona

L'agente esce dalla visita, apre il telefono e **parla per trenta secondi** — oppure scrive due righe. Il sistema trascrive, ripulisce la trascrizione dagli artefatti tipici dei motori di trascrizione e produce **due documenti**:

1. il **report per il proprietario**, formale e pronto da inviare su WhatsApp o in PDF;
2. la **sintesi interna per l'agente**: interesse, obiezioni, osservazioni sul prezzo, prossime azioni.

L'invio al proprietario parte con un clic; se manca il numero, lo chiede al volo e lo salva.

#### Il Pain

> *"Il proprietario mi chiama ogni settimana per sapere com'è andata. I report li scrivo il sabato sera, quando ho tempo. E quando non li scrivo, alla scadenza dell'incarico mi sento dire che non mi sono fatto sentire."*

#### Il Pitch

> *"Questo modulo non le fa risparmiare tempo: le fa **rinnovare gli incarichi**, e le fa **abbassare i prezzi fuori mercato**.*
>
> *Il proprietario che riceve un report professionale dopo ogni visita sa che lei sta lavorando. Quello che non riceve niente pensa che il suo immobile sia fermo, e alla scadenza va dall'agenzia di fronte.*
>
> *E quando dopo sei visite deve dirgli che il prezzo è alto, non è più la sua opinione contro la sua: sono sei report scritti, con le obiezioni di sei persone diverse che dicono la stessa cosa."*

---

### 2.4 Analisi & Due Diligence Aste

#### Come funziona

L'agente carica il **PDF della perizia** — non compila un modulo. Il sistema legge il documento (una perizia sta fra le trenta e le centoventi pagine) e ne ricava:

- **stato occupazionale** — libero, occupato con titolo opponibile, occupato senza titolo;
- **difformità edilizie**, con evidenza a parte di quelle che il perito dichiara **non sanabili**;
- **vincoli e gravami** che restano a carico dell'aggiudicatario;
- **costi di sanatoria**, valore di stima, offerta minima;
- **modalità di vendita** (senza/con incanto) e **percentuale di cauzione**;
- un **semaforo di rischio** e il **margine stimato**.

Due dettagli che valgono in trattativa:

- **il semaforo non lo decide l'AI.** Lo calcola il codice, con criteri scritti e mostrati accanto al colore. L'AI riferisce solo cosa c'è scritto nella perizia; il giudizio resta di chi ha responsabilità.
- **il PDF non viene conservato.** Resta in memoria il tempo dell'analisi e viene scartato. E lo schema di estrazione **non ha alcun campo** per il nome dell'esecutato: il modo più solido di non trattare un dato è non avere dove metterlo.

#### Il Pain

> *"Le aste sono il segmento più redditizio, ma per valutare un lotto devo leggermi novanta pagine di perizia. Quindi non le leggo, e o lascio perdere o rilancio al buio."*

#### Il Pitch

> *"Lei carica la perizia e in pochi secondi sa le tre cose che decidono se vale la pena: se è occupato, se ci sono abusi non sanabili e quanto le resta di margine dopo sanatoria e imposte.*
>
> *Non le diciamo se comprare — quella è una sua responsabilità e non ce la prendiamo. Le diamo i fatti che stanno in quelle novanta pagine, con accanto i criteri con cui abbiamo acceso il semaforo, così può controllarli. In una sera lei ne vaglia venti invece di uno."*

---

### 2.5 Social & Annunci *(Enterprise)*

#### Come funziona

Dagli stessi dati dell'immobile — o da un annuncio esistente incollato, o dal portafoglio — genera **tre formati insieme**: l'annuncio per i portali (ottimizzato per la ricerca locale), il post per Instagram/Facebook con hashtag, e lo script per un Reel/TikTok con hook, scene e call to action.

La regola non negoziabile: **non inventa**. Se le note non dicono la classe energetica, l'annuncio non la nomina; se non c'è scritto "ristrutturato", non lo scrive.

#### Il Pain

> *"Scrivere l'annuncio mi porta via mezz'ora. Per i social non ho tempo, e infatti la nostra pagina è ferma da mesi."*

#### Il Pitch

> *"Stessa scheda immobile, tre contenuti pronti: il portale, il post, il video. Mezz'ora diventa un minuto.*
>
> *E soprattutto: non inventa. Il rischio di questi strumenti è che le scrivano 'ristrutturato' su un immobile che non lo è — una pubblicità ingannevole con la sua firma sotto. Il nostro genera **solo** con i dati che le ha dato lei."*

---

## 3. Gestione delle obiezioni

### Obiezione 1 — *"Ho già un gestionale, non voglio cambiare tutto"*

**La più frequente, e la più facile: perché ha ragione lui.**

> *"Non le sto chiedendo di cambiare gestionale. Il gestionale è il suo archivio e ci resta.*
>
> *PropertyTech fa le cose che il gestionale **non** fa: rispondere al lead in pochi secondi, leggere una perizia, scrivere il report al proprietario. E i due parlano: i lead qualificati possono essere inoltrati al suo gestionale via webhook, oppure esportati in CSV. Se domani ci lascia, il suo portafoglio e i suoi lead escono in un file Excel. Non c'è niente che resti prigioniero qui dentro."*

**Se chiede un'integrazione diretta col suo gestionale, non promettere:** abbiamo preconfigurazioni per i gestionali italiani, ma **l'endpoint e la chiave li rilascia il suo fornitore**. Dillo, e proponi il test di connessione: manda un lead finto con la mappatura reale e si vede in cinque secondi se funziona.

---

### Obiezione 2 — *"Costa troppo"* / *"I miei agenti non lo useranno"*

Due obiezioni diverse. Separale.

**Sul prezzo — fai l'aritmetica con lui, non per lui:** (vedi §7.2 per i numeri di riferimento)

> *"Qual è la sua provvigione media su una vendita? […] Bene. Starter costa 99 € al mese: **1.188 € l'anno**. Le basta **una** trattativa in più — un lead che oggi perde perché risponde tre ore dopo, o un incarico che rinnova perché il proprietario si è sentito seguito — e l'anno è pagato. Tutto il resto è margine.*
>
> *E non deve decidere adesso: il Trial è gratuito e non chiede la carta."*

**Sull'adozione degli agenti — è l'obiezione seria, trattala come tale:**

> *"Ha ragione a preoccuparsene: la maggior parte dei software muore lì. Per questo qui non c'è niente da scrivere e niente da imparare — si carica un PDF, si preme un pulsante, si parla trenta secondi al telefono. Non c'è un campo dove l'agente debba 'chiedere bene' qualcosa all'AI.*
>
> *E su Enterprise **non paga per postazione**: i suoi agenti sono illimitati. Non deve scegliere a chi darlo, quindi non deve nemmeno convincere nessuno — lo provano tutti e in due settimane sa chi lo usa."*

> ⚠️ **Da non sbagliare:** le postazioni illimitate sono **solo su Enterprise**. Starter ne ha **1**, Professional **3** (con possibilità di acquistarne altre). Non dire mai "la multi-utenza è gratuita" in generale: è vero solo sul piano alto, e se lo scopre all'attivazione hai perso la fiducia su tutto il resto.

---

### Obiezione 3 — *"L'AI sbaglia, e i dati dei miei clienti dove finiscono?"*

Due paure in una. Rispondi a entrambe: prima il controllo, poi la privacy.

**Sul controllo:**

> *"L'AI qui non decide niente di importante. Il semaforo di rischio su un'asta lo calcola il codice con criteri scritti, che le mostriamo accanto al colore. Gli annunci non inventano dati che lei non ha fornito. E ogni testo che esce verso un cliente porta l'indicazione che è generato con AI e va verificato.*
>
> *Niente parte da solo: nessun messaggio, nessun post, nessun report viene inviato senza che qualcuno prema un pulsante."*

**Sulla privacy:**

> *"Database e calcolo stanno in Unione Europea, a Francoforte. Il primo messaggio WhatsApp al cliente contiene l'informativa e il 'STOP per cancellarsi', e chi risponde STOP non viene più ricontattato — mai, nemmeno da una nuova richiesta.*
>
> *All'attivazione lei firma con noi l'accordo sul trattamento dei dati previsto dall'art. 28 del GDPR, ed è lei il titolare dei dati: noi li trattiamo per suo conto.*
>
> *Un esempio di come ragioniamo: quando analizziamo la perizia di un'asta, quel documento contiene nome e situazione patrimoniale del debitore. Il nostro sistema **non ha nemmeno un campo** dove metterli, e il PDF non viene conservato. Non è una promessa: è come è costruito."*

---

## 4. I punti di forza invisibili

Non si vendono da soli, ma **si usano per chiudere** quando il cliente confronta due preventivi e cerca una ragione per fidarsi.

### Privacy e conformità, per costruzione

- Dati e **calcolo** in UE (Francoforte), non solo il database.
- Isolamento fra agenzie imposto a ogni singola interrogazione: nessuna vede i dati di un'altra.
- Credenziali di terze parti (token WhatsApp, chiavi dei gestionali) **cifrate a riposo** e mai restituite al browser.
- Accordo GDPR art. 28 registrato **con data e versione**, non con una spunta.
- Il servizio di monitoraggio riceve **dove** è avvenuto un errore, mai il contenuto: niente numeri, testi di conversazioni o trascrizioni.

### Nessun lock-in

Export CSV di lead e portafoglio, export XML per i portali, webhook verso il gestionale. **Chi entra può uscire portandosi tutto**, ed è un argomento di vendita: toglie la paura di sbagliare scelta.

### Robustezza dichiarata

- Quando i crediti finiscono, il lead **viene comunque salvato** e resta in pipeline: non si perde una richiesta già arrivata perché il piano è esaurito.
- Un'elaborazione fallita **non consuma credito**.
- Se l'analisi di una perizia non riesce, la scheda lo dice con un messaggio che spiega cosa fare — non resta "in caricamento" per sempre.
- Le operazioni che riguardano l'intera agenzia (fatturazione, feed verso i portali, inviti al team) sono **riservate al titolare**, e il controllo è nel server, non solo nell'interfaccia.

### Come usarli

Tienine **due in tasca**, non recitarli in ordine:

- teme di restare incastrato → **no lock-in**;
- è attento ai dati (o ha un DPO) → **UE, cifratura, art. 28**;
- ha già avuto una brutta esperienza con un software → **robustezza**.

---

## 5. Cosa NON promettere

**Leggi questa sezione prima di ogni call.**

| Non dire | La verità, da dire così |
|---|---|
| *"È a norma antiriciclaggio"* | Il Fascicolo documentale conserva i documenti per dieci anni e avvisa delle scadenze. **Non certifica nulla**: valutazione del rischio e segnalazione alla UIF restano in capo all'agenzia. Venderlo come conformità la espone a sanzioni, con la nostra promessa scritta come prova. |
| *"Si firma digitalmente dalla piattaforma"* | **Non c'è la firma digitale.** Richiede un prestatore qualificato accreditato: si integra, non si costruisce. |
| *"Si integra col suo gestionale"* | Ci sono preconfigurazioni, ma **endpoint e chiave li rilascia il fornitore all'agenzia**. |
| *"I portali importano subito il nostro feed"* | Il tracciato è quello più diffuso in Italia, ma **non esiste uno standard unico** e va confermato dal referente tecnico del portale. Dillo tu per primo: fa professionista. |
| *"Registra le note vocali e trascrive"* | Il percorso **testuale** funziona sempre. La **trascrizione audio** richiede la configurazione di un servizio dedicato: verifica che sia attiva prima di dimostrarla. |
| *"Trova le aste al posto suo"* | Il modulo **analizza** i lotti che l'agente porta. Non li cerca sul web. |
| *"L'AI le dice se conviene comprare"* | L'AI riferisce cosa c'è scritto nella perizia. Il semaforo lo calcola il codice. **Nessuno dei due dà un consiglio di investimento.** |

---
---

# PARTE II — IL MERCATO

## 6. Glossario rapido

Non serve a fare gli esperti: serve a **non sembrare estranei**. Un agente capisce in trenta secondi se chi ha davanti conosce il mestiere.

| Termine | Cosa significa | Perché ci serve |
|---|---|---|
| **Incarico (in esclusiva)** | Il mandato scritto con cui il proprietario affida la vendita all'agenzia, per una durata definita. | È l'asset dell'agenzia. I Report Vocali esistono per **difendere l'incarico**. |
| **Acquisizione** | Il lavoro di procurarsi nuovi incarichi. | Il bot riconosce chi vuole **vendere**, non solo chi vuole comprare: è il lead che vale di più. |
| **Notizia** | La segnalazione di un immobile che sta per essere venduto, prima che arrivi sui portali. | Chi ce l'ha guadagna. Spiega perché un'agenzia paga per arrivare prima. |
| **Farming** | Presidiare una zona: conoscerne palazzi, prezzi, proprietari. | Conoscere la zona meglio dei concorrenti. |
| **Speed to lead** | Il tempo fra la richiesta del cliente e la prima risposta. | **È la nostra metrica.** Vedi §7.2. |
| **Visura catastale** | Documento dell'Agenzia delle Entrate: foglio, particella, subalterno, categoria, rendita, intestatari. | Dice **chi risulta intestatario**, non chi è proprietario legale: i due piani possono divergere. |
| **APE** | Attestato di Prestazione Energetica: classe (A4–G) e indice EPgl,nren. | Obbligatorio negli annunci. Lo leggiamo e non lo inventiamo mai. |
| **Asta senza/con incanto** | Le due modalità di vendita giudiziaria. Senza incanto (buste chiuse) è la regola; con incanto è residuale. | Il Radar le distingue: fa capire che il software l'ha scritto chi ha guardato una perizia vera. |
| **Provvigione** | Il compenso dell'agenzia, percentuale sul prezzo, **da entrambe le parti**. | Serve per l'aritmetica del valore. Vedi §7.2. |
| **Gestionale / MLS** | Il software con cui l'agenzia archivia immobili e clienti (Gestim, Getrix, Frimm, MioGest…). | **Non siamo un gestionale.** Ripeterlo disinnesca l'obiezione più frequente. |

---

## 7. Academia Immobiliare

Questa sezione serve a una cosa sola: farti parlare **da pari** con un agente senior. Non per fare sfoggio, ma perché un agente che sente due imprecisioni di fila smette di ascoltare il resto.

### 7.1 Il ciclo di vita dell'incarico

È il processo reale di un'agenzia. Impararlo significa sapere **in quale punto** stai togliendo dolore, invece di elencare funzioni.

| # | Fase | Cosa succede davvero | Dove entriamo noi |
|---|---|---|---|
| 1 | **Acquisizione** | L'agente cerca proprietari intenzionati a vendere: farming, passaparola, citofoni, cartelli, ex clienti. È il lavoro più duro. | Il bot WhatsApp riconosce l'intento **VENDITA** e raccoglie i dati dell'immobile da vendere. |
| 2 | **Notizia** | Arriva la soffiata: "i vicini vendono". Vale oro perché precede i concorrenti. | — (è relazione umana) |
| 3 | **Valutazione** | Sopralluogo e stima. Qui si gioca l'incarico: chi spara il prezzo più alto spesso lo prende, e poi non vende. | Analisi Documenti (visura, planimetria, APE) per arrivare preparato. |
| 4 | **Incarico** | Si firma il mandato. **In esclusiva**: solo quell'agenzia, di norma 3–6 mesi. **Non in esclusiva**: più agenzie, l'agente investe meno. | Fascicolo documentale: scadenza dell'incarico tracciata e avvisata. |
| 5 | **Promozione** | Foto, annuncio, pubblicazione su portali e social. | Social & Annunci (tre formati), Feed XML (pubblicazione automatica). |
| 6 | **Gestione richieste** | Arrivano i lead dai portali. Vanno filtrati: molti sono curiosi o senza copertura finanziaria. | **Il cuore del prodotto:** risposta in secondi, qualifica, appuntamento in agenda. |
| 7 | **Visita** | Si accompagna il cliente. Escono obiezioni e osservazioni sul prezzo. | Report Vocali: trenta secondi di voce → report al proprietario. |
| 8 | **Proposta d'acquisto** | Offerta scritta e irrevocabile dell'acquirente, con caparra. Se accettata dal venditore, diventa vincolante. | Scheda lead, stato della trattativa. |
| 9 | **Preliminare (compromesso)** | Contratto che impegna le parti; si trascrive; si versa la caparra confirmatoria. | Fascicolo documentale: raccolta dei documenti per il rogito. |
| 10 | **Rogito** | Atto notarile: si trasferisce la proprietà. **Qui l'agenzia incassa.** | — |

**Perché ti serve saperlo:** il titolare non compra "un software con l'AI". Compra *più incarichi* (fasi 1–4) o *più conversioni* (fasi 6–8). Capisci quale dei due gli manca, e vendi quello.

### 7.2 Metriche e dolori reali

#### a) Decadimento del lead — perché i minuti contano

I dati canonici vengono da due studi americani B2B, non dal residenziale italiano: usali come **ordine di grandezza**, non come verità locale.

- **Studio MIT / InsideSales (Oldroyd)** — su oltre 15.000 lead e 100.000 tentativi di chiamata: contattare un lead entro **5 minuti** rende **21 volte più probabile** qualificarlo rispetto ad aspettare **30 minuti**, e circa **100 volte più probabile** riuscire a parlarci.
- **Audit Harvard Business Review (2011)** su 2.241 aziende: tempo medio di prima risposta **42 ore**; **il 23% non rispondeva mai**; rispondere entro **un'ora** rendeva ~**7 volte** più probabile qualificare il contatto.

**Come usarlo in trattativa — non citare gli studi, fai una domanda:**

> *"Se un cliente scrive a tre agenzie e la prima risponde in due minuti, lei che risponde stasera con chi pensa che stia parlando?"*

Poi, solo se chiede i numeri: *"Gli studi di settore dicono che fra i 5 e i 30 minuti la probabilità di qualificare un contatto crolla di oltre venti volte."*

#### b) Costo di acquisizione dell'incarico (CPA)

Quanto costa all'agenzia portare a casa **un solo** immobile da vendere. Le voci:

- abbonamenti ai portali (la voce più pesante e ricorrente);
- volantinaggio, cartelli, stampe;
- benzina e ore per sopralluoghi che non si trasformano in incarico;
- il costo del tempo dell'agente, che è la voce che nessuno conta.

> ⚠️ **Non citare una cifra media: non esiste un dato affidabile e nazionale, e un titolare la smonta in due secondi.** Fallo calcolare a lui:
>
> *"Su dieci valutazioni che fate, quanti incarichi portate a casa? E quanto vi costa al mese fra portali e materiali? […] Quindi ogni incarico vi costa circa X. Quanti ne perdete perché non richiamate in tempo?"*

Le sue cifre valgono cento volte una nostra statistica.

#### c) Farming e zona

L'agente "coltiva" un quartiere: sa quali palazzi hanno quali tagli, a quanto si è venduto l'ultimo trilocale, chi sta per trasferirsi. È un investimento di anni, ed è il motivo per cui **un agente non cambia zona** e per cui i dati per zona valgono più dei dati nazionali.

**Aggancio commerciale:** *"Quante richieste le arrivano dalla sua zona di riferimento? Tutte quelle a cui non risponde in tempo sono farming buttato."*

#### d) Sconto medio e DOM (Days on Market)

**DOM** = da quanti giorni l'immobile è sul mercato. È la metrica che spiega il dolore più grande dell'agente:

1. Il proprietario pretende un prezzo fuori mercato. L'agenzia accetta l'incarico per non perderlo.
2. L'immobile riceve poche visite. I giorni passano.
3. Sui portali un annuncio "vecchio" perde visibilità e viene percepito come problematico.
4. Dopo mesi si taglia il prezzo — spesso sotto quello che si sarebbe ottenuto partendo giusti.
5. L'incarico scade nel frattempo e il proprietario cambia agenzia, convinto che l'agente non abbia lavorato.

> **Questo è il pitch più forte dei Report Vocali, e va detto così:**
>
> *"Il problema non è convincere il proprietario che il prezzo è alto. È che lei glielo dice e lui sente 'l'agente vuole vendere in fretta'. Con sei report scritti in mano, non è più la sua opinione: sono sei visite in cui persone diverse hanno detto la stessa cosa. Il prezzo lo abbassa lui, e lei tiene l'incarico."*

### 7.3 Linguaggio: come suonare "di casa"

| Dì così | Non così | Perché |
|---|---|---|
| **incarico**, **mandato** | "contratto con noi" | "Incarico" è la parola del mestiere. |
| **acquisizione** | "trovare case da vendere" | Definisce metà del loro lavoro. |
| **immobile**, **soluzione** | "casa" (sempre) | In trattativa usano "immobile"; "casa" va bene col cliente finale. |
| **parte venditrice / acquirente** | "il tizio che vende" | Registro professionale. |
| **richiesta**, **contatto** | "lead" (con agenti senior) | Con un titolare under 40 "lead" va benissimo; con uno di vecchia scuola suona da marketing. Ascolta quale usa lui e adeguati. |
| **proposta** e **preliminare** sono **cose diverse** | usarli come sinonimi | Confonderli è l'errore che ti smaschera subito. |
| **gestionale** | "CRM" | Loro lo chiamano gestionale. |
| **assistente**, **automazione** | "piattaforma AI-powered" | Il gergo tech li allontana. |
| **portali** | "marketplace" | — |

**Tre frasi da non dire mai:**

- ❌ *"Vi sostituiamo l'agente"* → temono la sostituzione, non la desiderano. Di': *"fa il lavoro che nessuno ha voglia di fare la sera"*.
- ❌ *"È facilissimo, lo capisce chiunque"* → suona condiscendente. Di': *"non c'è niente da imparare"*.
- ❌ *"Il nostro algoritmo valuta l'immobile"* → la valutazione è la loro competenza, e gliela stai togliendo. Di': *"le prepariamo i dati, la valutazione resta sua"*.

---
---

# PARTE III — TROVARE E CHIUDERE CLIENTI

## 8. Strategia di acquisizione (Go-to-Market)

> ⚖️ **Prima di tutto, una regola che non è negoziabile.** Vendiamo conformità GDPR: non possiamo violarla noi. Il contatto commerciale B2B verso indirizzi aziendali pubblici è praticabile in legittimo interesse, ma **deve** identificare chiaramente il mittente, dire dove abbiamo preso il contatto e offrire in ogni messaggio un modo immediato per non essere più contattati. Una segnalazione al Garante, per noi, non è un fastidio: è la fine dell'argomento di vendita principale.

### Strategia A — A budget zero

L'obiettivo non è il volume: è la **specificità**. Un messaggio che dimostra che hai guardato *quella* agenzia batte cento invii identici.

#### A.1 — Cold outreach consulenziale (email / LinkedIn)

**Il principio:** non presenti un software. Porti un'osservazione utile su qualcosa che hanno già online, e chiudi con una domanda — non con un link a un calendario.

**Template email — primo contatto**

> **Oggetto:** una cosa sui vostri annunci su Immobiliare.it
>
> Buongiorno [Nome],
>
> ho guardato i vostri annunci a [Città] — in particolare quello di [via/zona riconoscibile].
>
> Le scrivo per una cosa sola: ho notato che [**osservazione specifica e verificabile**: es. "sette immobili su venti non hanno fotografie", oppure "le descrizioni sono identiche fra tre annunci diversi"]. Sui portali è il fattore che pesa di più sulle visualizzazioni.
>
> Ci occupiamo di automazione per agenzie immobiliari: fra le altre cose generiamo annuncio, post e script video dagli stessi dati della scheda, in un minuto.
>
> Non le propongo una demo adesso. Le chiedo solo: **chi risponde alle richieste dei portali quando i suoi agenti sono in visita?**
>
> [Nome Cognome] — PropertyTech
> [telefono] · [sito]
> *Ha ricevuto questa email perché il suo indirizzo è pubblicato sulla vostra scheda agenzia su [portale]. Risponda "no grazie" e non la contatterò più.*

**Perché funziona:** l'osservazione specifica dimostra lavoro reale; la domanda finale fa parlare lui del problema; l'opt-out in chiaro ci mette in regola e, paradossalmente, aumenta la credibilità.

**LinkedIn — sequenza in tre tempi**

1. **Collegamento** con nota breve: *"Buongiorno [Nome], seguo il mercato di [Città]. Mi collego volentieri."* — nient'altro. Chi vende nella richiesta di collegamento viene ignorato.
2. **Dopo 3–5 giorni**, se accetta: una domanda, non un pitch. *"Curiosità professionale: sui lead dei portali, riuscite a rispondere entro pochi minuti o vi capita di recuperarli la sera?"*
3. **Solo se risponde**, e solo allora, l'offerta: *"Noi risolviamo esattamente quello. Le mando due righe su come, o preferisce quindici minuti al telefono?"*

#### A.2 — I portali come lista di prospect qualificati

I portali sono **allo stesso tempo** il posto dove trovi le agenzie e dove vedi se hanno bisogno di te. Segnali da cercare in un annuncio:

| Segnale osservato | Cosa ti dice | Aggancio da usare |
|---|---|---|
| Annunci **senza foto** o con 2–3 foto sfocate | Nessuno ha tempo di curarli | Social & Annunci, e la nostra scheda che **avvisa** quando un immobile pubblicato è senza foto |
| Descrizioni **copiate e incollate** fra annunci | Nessuno scrive i testi | Generatore annunci |
| Annunci **online da molti mesi** con prezzo ritoccato | Problema di prezzo e di rapporto col proprietario | Report Vocali (§7.2.d) |
| Molti immobili (30+) e **pochi agenti** in scheda | Volume alto, tempo scarso: **il nostro cliente ideale** | Speed to lead |
| **Dati mancanti** (CAP, classe energetica) | Feed o inserimento manuale trascurato | Feed XML |

> ⚠️ **Non aprire la conversazione con una critica.** *"I vostri annunci fanno pena"* chiude la porta. *"Ho visto che avete parecchi immobili senza foto — probabilmente è solo questione di tempo, non di volontà"* la apre.

#### A.3 — Social selling e posizionamento

L'obiettivo è che, quando cercano "AI per agenzie immobiliari", trovino **voi due** come le persone che ne capiscono.

- **Gruppi Facebook/LinkedIn di agenti immobiliari italiani:** partecipa **sei settimane senza vendere niente**. Rispondi a domande tecniche (visure, aste, portali). Poi il prodotto lo chiedono loro.
- **Contenuti che funzionano** (in ordine di efficacia): *(1)* smontare un documento vero — "cosa guardo in una perizia d'asta nei primi 60 secondi"; *(2)* confronti prima/dopo su un annuncio riscritto; *(3)* numeri onesti — "abbiamo misurato quanto tempo serve a leggere una perizia di 90 pagine".
- **Il vostro vantaggio ingiusto:** avete costruito il software. Potete raccontare *perché* certe scelte (il parser che rifiuta una P.IVA come numero di telefono, il semaforo calcolato dal codice e non dall'AI). Nessun rivenditore può scrivere quei contenuti.

---

### Strategia B — Con budget pubblicitario

#### B.1 — Meta Ads (Facebook / Instagram)

**Chi targetizzare:** titolari e agenti immobiliari in Italia; interessi su Immobiliare.it, Idealista, gestionali; lookalike dei clienti Trial quando ne avrai abbastanza. Restringi per area se vendi in una regione.

**Formato che converte meglio:** video verticale 20–30 secondi, **schermo del telefono**, che mostra il bot che risponde a un lead in tempo reale. Non slide, non loghi: il prodotto che fa la cosa.

**Angoli di inserzione (testali a coppie):**

| Angolo | Copy |
|---|---|
| **Spreco di budget** | *"Paghi Immobiliare.it ogni mese. Poi rispondi ai lead dopo tre ore. Indovina con chi ha già parlato quel cliente."* |
| **Sabato sera** | *"Il report al proprietario lo scrivi il sabato sera? Trenta secondi di vocale in macchina e ce l'hai pronto."* |
| **Perizia** | *"Novanta pagine di perizia. Quaranta secondi per sapere se il lotto è occupato e quanto ti resta di margine."* |
| **Anti-sostituzione** | *"Non sostituisce il tuo agente. Fa il lavoro che il tuo agente rimanda a stasera."* |

**Non usare:** promesse di guadagno ("triplica le vendite") — attirano curiosi e bruciano credibilità con i professionisti.

#### B.2 — Google Search (intento)

Chi cerca su Google ha già un problema. Dividi per intento, e attenzione a un errore costoso:

| Gruppo | Esempi | Nota |
|---|---|---|
| **Alta intenzione, poco contesa** | "risposta automatica whatsapp agenzia immobiliare", "software analisi perizie aste", "feed xml immobiliare.it agenzia" | **Parti da qui.** Volumi bassi, costo per clic basso, intento altissimo. |
| **Problema, non prodotto** | "come rispondere velocemente ai lead immobiliari", "report al proprietario dopo visita" | Ottime per contenuti + retargeting. |
| **Testa, cara e ambigua** | "gestionale immobiliare", "software agenzia immobiliare" | ⚠️ **Attenzione:** costose, presidiate dai gestionali storici, e chi le cerca vuole *un gestionale* — che noi non siamo. Rischi di pagare clic che non convertiranno mai. Entraci solo dopo aver validato il resto. |

#### B.3 — Retargeting e lead magnet

- **Retargeting:** chi ha visitato la pagina prezzi senza attivare il Trial è il pubblico più caldo che avrai. Messaggio dedicato: *"Il Trial non chiede la carta di credito."* — è l'attrito numero uno.
- **Lead magnet:** *"La guida all'AI per agenzie immobiliari 2026"* funziona **solo se esiste davvero ed è buona**. Una guida generica fa più danni che bene.

> 💡 **Alternativa più forte di una guida:** un'**analisi gratuita di una perizia**. L'agenzia manda un PDF, noi restituiamo la scheda con semaforo, difformità e margine. Costa pochi centesimi di elaborazione, dimostra il prodotto sul *loro* caso reale, e richiede un contatto vero per la consegna. È il lead magnet migliore che abbiamo, perché è il prodotto stesso.

---

## 9. Prospection: trovare e mappare le agenzie

### 9.1 Pagine agenzie dei portali

Ogni portale ha un elenco agenzie per città. È la fonte migliore: dice **nome, indirizzo, telefono, numero di immobili in portafoglio e agenti in organico**.

**Come lavorarle:**

1. Filtra per città/provincia di interesse.
2. Ordina o scorri cercando le agenzie con **molti immobili** (da ~25–30 in su): volume alto significa lead in arrivo e tempo scarso.
3. Apri la scheda: conta gli agenti. **Molti immobili + pochi agenti = priorità massima.**
4. Guarda 3–4 annunci con i segnali della tabella §8.A.2. Annota **l'osservazione specifica** da usare nell'email.
5. Segna il portale di provenienza: ti serve per la riga sulla provenienza del contatto.

### 9.2 Google Maps — farming geografico

Cerca *"agenzia immobiliare"* su una **micro-zona** (quartiere, non città): è il modo di coprire un'area in modo sistematico invece che casuale.

Cosa leggi dalla scheda Maps:

- **numero e tono delle recensioni** → quanto curano il rapporto col cliente;
- **foto dell'ufficio** → dimensione reale (vetrina singola vs uffici su più piani);
- **sito web** → se è vecchio o assente, il divario tecnologico è la leva;
- **orari e presenza** → se è una monosede.

**Vantaggio:** puoi presentarti dicendo *"sono passato davanti al vostro ufficio in via X"*, e in una città media questo apre più porte di qualunque email.

### 9.3 Verifica della dimensione

Prima di investire tempo, capisci **quanto è grande**:

- **P.IVA e forma giuridica** in fondo al sito o sulla scheda portale: una S.r.l. con più agenti ha budget diverso da una ditta individuale.
- **Registro Imprese / visure camerali**: danno anno di costituzione, soci e talvolta il bilancio. Le visure complete si pagano, ma per la maggior parte dei casi bastano i dati gratuiti.
- **Proxy gratuito e affidabile:** numero di immobili sul portale + numero di agenti in scheda. Per il nostro target è sufficiente.

### 9.4 Franchising vs indipendenti — due vendite diverse

| | **Affiliato di rete** (Tecnocasa, Gabetti, RE/MAX, Grimaldi…) | **Indipendente / boutique** |
|---|---|---|
| **Chi decide** | Il titolare dell'affiliazione: è un imprenditore autonomo, non un dipendente. **Decide lui**, ma su alcuni strumenti la rete impone lo standard. | Il titolare, e basta. Ciclo di decisione più corto. |
| **Ostacolo principale** | *"La rete ci dà già il gestionale"* | *"Non ho budget / faccio già tutto io"* |
| **Come impostarla** | **Complementarietà:** *"Il gestionale della rete resta. Noi facciamo quello che quello non fa: rispondere in pochi secondi e leggere le perizie."* Non attaccare mai lo strumento della casa madre. | **Autonomia e sopravvivenza:** *"Lei compete con reti che hanno un ufficio marketing. Questo le dà la stessa reattività senza assumere nessuno."* |
| **Verifica preliminare** | Chiedi *"sugli strumenti decidete voi o passa dalla sede?"* — ti evita settimane perse. | — |
| **Bonus** | Un affiliato soddisfatto **parla con gli altri affiliati**: una vendita può aprirne cinque. | Più liberi di raccontarlo pubblicamente come caso studio. |

> ⚠️ Le politiche delle reti cambiano e variano per affiliazione: **non dare per scontato** che una rete vieti o imponga qualcosa. Chiedilo, non affermarlo.

### 9.5 Punteggio del prospect (chi chiamare per primo)

Assegna un punto per ciascuno. **Da 4 in su: chiama oggi.**

- ☐ 25+ immobili in portafoglio
- ☐ Meno di 5 agenti in scheda
- ☐ Annunci con foto mancanti o descrizioni copiate
- ☐ Indipendente, oppure affiliato che decide in autonomia
- ☐ Annunci fermi da mesi (problema di prezzo → aggancio Report Vocali)
- ☐ Lavora aste o immobili all'asta (aggancio Radar, poca concorrenza)

---

## 10. Promemoria per la prima call

**Struttura in 20 minuti:**

1. **5 min — Diagnosi.** Non presentare niente. Chiedi: *quanti lead al mese dai portali? chi risponde, e quanto ci mette? quanti incarichi non avete rinnovato quest'anno? chi scrive gli annunci?* Le loro risposte sono il tuo pitch.
2. **7 min — Demo di UN modulo solo**, quello che risponde al pain appena nominato. Mai la visita guidata completa: si esce senza ricordare niente.
3. **3 min — Prezzo**, con l'aritmetica della provvigione fatta con i loro numeri.
4. **5 min — Obiezioni e Trial.** Chiudi sempre sull'attivazione: gratuito, senza carta, e ci risentiamo fra una settimana con i loro dati dentro.

**La domanda che apre più trattative di qualunque slide:**

> *"Quando le arriva una richiesta da Immobiliare.it mentre è in visita — chi risponde, e dopo quanto?"*

---

## Fonti dei dati di mercato citati

- Tempo di risposta ai lead (MIT/InsideSales, Oldroyd; audit HBR 2011): [Lead Response Time — ogni studio](https://ainora.lt/blog/lead-response-time-statistics-every-study-2026) · [Lead Response Time Statistics 2026](https://setsmart.io/blog/lead-response-time-statistics)
- Provvigioni delle agenzie immobiliari in Italia (range 2–4% + IVA per parte, media indicata intorno al 3%): [GoMutuo — Provvigione agenzia immobiliare 2026](https://blog.gomutuo.it/blog/provvigione-agenzia-immobiliare-quanto-prende-2026) · [RealAdvisor — Percentuale agenzia immobiliare](https://realadvisor.it/it/blog/percentuale-agenzia-immobiliare)

> Gli studi sul tempo di risposta sono **B2B statunitensi**, non residenziale italiano: usali come ordine di grandezza. Le percentuali di provvigione **non sono fissate per legge** e sono negoziabili: presentale come riferimento, mai come tariffa.
