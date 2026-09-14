# Sales Playbook & Training Manual — PropertyTech

**Uso interno. Non consegnare al cliente.**
Versione 1.0 — settembre 2026

> Ogni numero e ogni affermazione tecnica in questo manuale è stato verificato contro il codice in produzione. La sezione finale **"Cosa NON promettere"** è la più importante del documento: una promessa che il prodotto non mantiene si paga all'onboarding, quando il cliente ha già firmato e si sente preso in giro.

---

## 1. Executive Summary

### Cos'è PropertyTech

Un assistente operativo AI per agenzie immobiliari italiane. Non è un gestionale e non vuole sostituirlo: si occupa delle attività che rubano tempo all'agente **fuori** dal gestionale — rispondere ai lead dei portali, leggere visure e perizie, scrivere annunci, preparare i report post-visita, tenere aggiornati i portali.

### La promessa di valore, in una frase

> **Fa in pochi secondi, e da solo, il lavoro che oggi l'agente rimanda a stasera.**

Le tre cose che questa frase contiene, e che vanno dette in questo ordine:

1. **Velocità** — il primo contatto con un lead arriva in pochi secondi, anche quando l'agente è in visita. Nel nostro mestiere chi risponde per primo chiude: il secondo trova un cliente che ha già parlato con qualcun altro.
2. **Continuità** — non si stanca il venerdì sera. La perizia di 90 pagine, il report al proprietario, l'annuncio per tre canali: sono i compiti che si accumulano e che nessuno ha mai voglia di fare a fine giornata.
3. **Zero formazione** — nessun prompt da scrivere, nessun corso. Caricamenti, tendine, pulsanti. Se serve un manuale, abbiamo sbagliato noi.

### Il target

**Chi compra:** il **titolare** di un'agenzia da 1 a 10 agenti. È lui che paga, che sente il costo di un lead perso e che risponde dei dati dei clienti.

**Chi usa:** gli **agenti**, spesso da smartphone, fra una visita e l'altra. Se non lo usano loro, il titolare disdice al secondo mese: è il vero rischio di churn, e per questo l'interfaccia è pensata mobile-first.

**Chi NON è il nostro cliente (oggi):**
- reti franchising con IT centralizzato e processi imposti dalla casa madre;
- agenzie che non lavorano i portali (solo passaparola): senza lead in ingresso, metà del valore non si attiva;
- agenzie fuori dall'Italia: il parser dei portali, la terminologia catastale e i tracciati sono tarati sul mercato italiano.

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

## 2. Glossario rapido del settore

Non serve a fare gli esperti: serve a **non sembrare estranei**. Un agente capisce in trenta secondi se chi ha davanti conosce il mestiere, e da lì in poi ascolta in modo diverso.

| Termine | Cosa significa | Perché ci serve |
|---|---|---|
| **Incarico (in esclusiva)** | Il mandato scritto con cui il proprietario affida la vendita all'agenzia. In esclusiva significa che solo quell'agenzia può venderlo, per una durata definita. | È l'asset dell'agenzia. Tutto il modulo Report Vocali esiste per **difendere l'incarico**: un proprietario informato rinnova, uno lasciato al buio no. |
| **Acquisizione** | Il lavoro di procurarsi nuovi incarichi. È il mestiere più difficile e più redditizio dei due (l'altro è vendere). | Il nostro bot WhatsApp riconosce chi vuole **vendere** e non solo chi vuole comprare: è il lead che vale di più. |
| **Notizia** | La segnalazione di un immobile che sta per essere messo in vendita, prima che finisca sui portali. | Chi ce l'ha, guadagna. Fa capire perché un'agenzia paga per arrivare prima. |
| **Farming** | Presidiare una zona: conoscerne i palazzi, i prezzi, i proprietari, essere "l'agenzia di quel quartiere". | Il Radar Aste e i dati per zona sono farming: conoscere la zona meglio dei concorrenti. |
| **Speed to lead** | Il tempo fra la richiesta di un cliente e la prima risposta dell'agenzia. | **È la nostra metrica.** Gli studi di settore sono concordi: rispondere entro pochi minuti moltiplica le probabilità di conversione. Noi rispondiamo in secondi. |
| **Visura catastale** | Documento dell'Agenzia delle Entrate: identifica l'immobile (foglio, particella, subalterno), la categoria, la rendita e gli intestatari. | Il Modulo Documenti la legge. Attenzione: dice **chi risulta intestatario**, non chi è il proprietario legale — i due piani possono divergere. |
| **APE** | Attestato di Prestazione Energetica. Riporta la classe (A4–G) e l'indice EPgl,nren. | Obbligatorio negli annunci. Il nostro estrattore lo legge e non lo inventa mai. |
| **Asta senza incanto / con incanto** | Le due modalità di vendita giudiziaria. Senza incanto (offerte in busta chiusa) è oggi la regola; con incanto (gara in udienza) è residuale. | Il Radar le distingue. È un dettaglio che fa capire all'agente che il software è stato scritto da chi ha guardato una perizia vera. |
| **Provvigione** | Il compenso dell'agenzia, in genere una percentuale sul prezzo, da entrambe le parti. | Serve per l'aritmetica del valore: *quanto vale una provvigione persa?* (vedi obiezione sul prezzo). |
| **Gestionale / MLS** | Il software con cui l'agenzia archivia immobili e clienti e pubblica sui portali (Gestim, Getrix, Frimm, MioGest…). | **Non siamo un gestionale.** Ripeterlo è la chiave per disinnescare l'obiezione più frequente. |

---

## 3. Analisi delle funzionalità

Per ogni modulo: **come funziona davvero**, il **pain** che risolve, il **pitch** da usare col titolare.

---

### 3.1 Qualifica Lead — Inbound Email Parsing + Bot WhatsApp

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

**Prova di solidità da citare se il cliente è tecnico:** il sistema rifiuta di trasformare in "numero di telefono" una partita IVA, un codice fiscale, un codice pratica o il fax nel piè di pagina — errori che altrove fanno partire messaggi WhatsApp verso il nulla a nome dell'agenzia.

---

### 3.2 Feed XML — Sincronizzazione con i portali

#### Come funziona

Un **unico indirizzo** che l'agenzia consegna al portale. Da lì in poi il portale rilegge il portafoglio da solo, di norma una o due volte al giorno.

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

### 3.3 Report Venditori da Note Vocali *(Enterprise)*

#### Come funziona

L'agente esce dalla visita, apre il telefono e **parla per trenta secondi** — oppure scrive due righe. Il sistema trascrive, ripulisce la trascrizione dagli artefatti tipici (le formule da video che i motori di trascrizione inventano sul rumore) e produce **due documenti**:

1. il **report per il proprietario**, formale e pronto da inviare su WhatsApp o in PDF;
2. la **sintesi interna per l'agente**: interesse, obiezioni, osservazioni sul prezzo, prossime azioni.

L'invio al proprietario parte con un clic; se manca il numero, lo chiede al volo e lo salva.

#### Il Pain

> *"Il proprietario mi chiama ogni settimana per sapere com'è andata. Io i report li scrivo il sabato sera, quando ho tempo. E quando non li scrivo, alla scadenza dell'incarico mi sento dire che non mi sono fatto sentire."*

#### Il Pitch

> *"Questo modulo non le fa risparmiare tempo: le fa **rinnovare gli incarichi**.*
>
> *Il proprietario che riceve un report professionale dopo ogni visita sa che lei sta lavorando. Quello che non riceve niente pensa che il suo immobile sia fermo, e alla scadenza va dall'agenzia di fronte. Il costo di un incarico perso è una provvigione intera: quante ne servono per pagare un anno di abbonamento?*
>
> *E il suo agente non scrive più niente il sabato sera: parla trenta secondi in macchina, e il report è pronto prima che arrivi al prossimo appuntamento."*

---

### 3.4 Analisi & Due Diligence Aste

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

### 3.5 Social & Annunci *(Enterprise)*

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

## 4. Gestione delle obiezioni

### Obiezione 1 — *"Ho già un gestionale, non voglio cambiare tutto"*

**È l'obiezione più frequente, ed è anche la più facile: perché ha ragione lui.**

> *"Non le sto chiedendo di cambiare gestionale. Il gestionale è il suo archivio e ci resta.*
>
> *PropertyTech fa le cose che il gestionale **non** fa: rispondere al lead in pochi secondi, leggere una perizia, scrivere il report al proprietario. E i due parlano: i lead qualificati possono essere inoltrati al suo gestionale via webhook, oppure esportati in CSV. Se domani ci lascia, il suo portafoglio e i suoi lead escono in un file Excel. Non c'è niente che resti prigioniero qui dentro."*

**Se chiede un'integrazione diretta col suo gestionale, non promettere:** abbiamo preconfigurazioni per i gestionali italiani, ma **l'endpoint e la chiave li rilascia il suo fornitore**. Di' esattamente questo, e proponi il test di connessione: manda un lead finto con la mappatura reale e si vede in cinque secondi se funziona.

---

### Obiezione 2 — *"Costa troppo"* / *"I miei agenti non lo useranno"*

Sono due obiezioni diverse. Separale.

**Sul prezzo — fai l'aritmetica con lui, non per lui:**

> *"Qual è la sua provvigione media su una vendita? […] Bene. Starter costa 99 € al mese: **1.188 € l'anno**. Le basta **una** trattativa in più — un lead che oggi perde perché risponde tre ore dopo, o un incarico che rinnova perché il proprietario si è sentito seguito — e l'anno è pagato. Tutto il resto è margine.*
>
> *E non deve decidere adesso: il Trial è gratuito e non chiede la carta."*

**Sull'adozione degli agenti — è l'obiezione seria, trattala come tale:**

> *"Ha ragione a preoccuparsene: la maggior parte dei software muore lì. Per questo qui non c'è niente da scrivere e niente da imparare — si carica un PDF, si preme un pulsante, si parla trenta secondi al telefono. Non c'è un campo dove l'agente debba 'chiedere bene' qualcosa all'AI.*
>
> *E su Enterprise **non paga per postazione**: i suoi agenti sono illimitati. Non deve scegliere a chi darlo, quindi non deve nemmeno convincere nessuno — lo provano tutti e in due settimane sa chi lo usa."*

> ⚠️ **Attenzione, da non sbagliare:** le postazioni illimitate sono **solo su Enterprise**. Starter ne ha **1**, Professional **3** (con possibilità di acquistarne altre). Non dire mai "la multi-utenza è gratuita" in generale: è vero solo sul piano alto, e se lo scopre all'attivazione hai perso la fiducia su tutto il resto.

---

### Obiezione 3 — *"L'AI sbaglia, e i dati dei miei clienti dove finiscono?"*

Due paure in una. Rispondi a entrambe, in quest'ordine — prima il controllo, poi la privacy.

**Sul controllo:**

> *"L'AI qui non decide niente di importante. Il semaforo di rischio su un'asta lo calcola il codice con criteri scritti, che le mostriamo accanto al colore. Gli annunci non inventano dati che lei non ha fornito. E ogni testo che esce verso un cliente porta l'indicazione che è generato con AI e va verificato: non le mettiamo in mano un documento che sembra scritto da un professionista senza dirlo.*
>
> *Niente parte da solo: nessun messaggio, nessun post, nessun report viene inviato senza che qualcuno prema un pulsante."*

**Sulla privacy:**

> *"Database e calcolo stanno in Unione Europea, a Francoforte. Il primo messaggio WhatsApp al cliente contiene l'informativa e il 'STOP per cancellarsi', e chi risponde STOP non viene più ricontattato — mai, nemmeno da una nuova richiesta.*
>
> *All'attivazione lei firma con noi l'accordo sul trattamento dei dati previsto dall'art. 28 del GDPR, ed è lei il titolare dei dati: noi li trattiamo per suo conto.*
>
> *Un esempio di come ragioniamo: quando analizziamo la perizia di un'asta, quel documento contiene nome e situazione patrimoniale del debitore. Il nostro sistema **non ha nemmeno un campo** dove metterli, e il PDF non viene conservato. Non è una promessa: è come è costruito."*

---

## 5. Chiusura — I punti di forza invisibili

Non si vendono da soli, ma **si usano per chiudere** quando il cliente sta confrontando due preventivi e cerca una ragione per fidarsi.

### Privacy e conformità, per costruzione

- Dati e **calcolo** in UE (Francoforte), non solo il database.
- Isolamento fra agenzie imposto a livello di ogni singola interrogazione: nessuna può vedere i dati di un'altra.
- Credenziali di terze parti (token WhatsApp, chiavi dei gestionali) **cifrate a riposo** e mai restituite al browser.
- Accordo GDPR art. 28 registrato **con data e versione**, non con una spunta.
- Il servizio di monitoraggio riceve **dove** è avvenuto un errore, mai il contenuto: niente numeri, testi di conversazioni o trascrizioni.

### Nessun lock-in

Export CSV di lead e portafoglio, export XML per i portali, webhook verso il gestionale. **Chi entra può uscire portandosi tutto**, ed è un argomento di vendita: toglie la paura di sbagliare scelta.

### Robustezza dichiarata

- Quando i crediti finiscono, il lead **viene comunque salvato** e resta in pipeline: non si perde una richiesta già arrivata perché il piano è esaurito.
- Un'elaborazione fallita **non consuma credito**.
- Se l'analisi di una perizia non riesce, la scheda lo dice con un messaggio che spiega cosa fare — non resta "in caricamento" per sempre.
- Le operazioni che riguardano l'intera agenzia (fatturazione, feed verso i portali, inviti al team) sono **riservate al titolare**: un collaboratore non può attivarle, e il controllo è nel server, non solo nell'interfaccia.

### Come usarli

Non recitarli in ordine. Tienine **due in tasca** e tirali fuori quando servono:

- se il cliente teme di restare incastrato → **no lock-in**;
- se è il tipo attento ai dati (o ha un DPO) → **UE, cifratura, art. 28**;
- se ha già avuto una brutta esperienza con un software → **robustezza**: i crediti, l'errore che si spiega, il lead che non si perde.

---

## 6. Cosa NON promettere

**Leggi questa sezione prima di ogni call.** Sono i punti dove è facile farsi trascinare dall'entusiasmo e dove la bugia si scopre subito.

| Non dire | La verità, da dire così |
|---|---|
| *"È a norma antiriciclaggio"* | Il Fascicolo documentale conserva i documenti per dieci anni e avvisa delle scadenze. **Non certifica nulla**: la valutazione del rischio e la segnalazione alla UIF restano in capo all'agenzia. Venderlo come conformità la espone a sanzioni, con la nostra promessa scritta come prova. |
| *"Si firma digitalmente dalla piattaforma"* | **Non c'è la firma digitale.** Richiede un prestatore qualificato accreditato: si integra, non si costruisce. |
| *"Si integra col suo gestionale"* | Ci sono preconfigurazioni per i gestionali italiani, ma **endpoint e chiave li rilascia il fornitore all'agenzia**. Promettere un'integrazione che poi non consegna è peggio di non averla. |
| *"I portali importano subito il nostro feed"* | Il tracciato è quello più diffuso in Italia, ma **non esiste uno standard unico** e va confermato dal referente tecnico del portale prima del primo caricamento massivo. Dillo tu per primo: fa professionista, non fa perdere la vendita. |
| *"Registra le note vocali e trascrive"* | Il percorso **testuale** funziona sempre. La **trascrizione audio** richiede la configurazione di un servizio dedicato: verifica con noi che sia attiva sull'ambiente del cliente prima di dimostrarla. |
| *"Trova le aste al posto suo"* | Il modulo **analizza** i lotti che l'agente porta. Non va a cercarli sul web. Chi si aspetta il contrario apre la pagina, non trova risultati e conclude che sia rotta. |
| *"L'AI le dice se conviene comprare"* | L'AI riferisce cosa c'è scritto nella perizia. Il semaforo lo calcola il codice con criteri dichiarati. **Nessuno dei due dà un consiglio di investimento**, e va detto. |

---

## 7. Promemoria per la prima call

**Struttura in 20 minuti:**

1. **5 min — Diagnosi.** Non presentare niente. Chiedi: *quanti lead al mese dai portali? chi risponde, e quanto ci mette? quanti incarichi non avete rinnovato quest'anno? chi scrive gli annunci?* Le loro risposte sono il tuo pitch.
2. **7 min — Demo di UN modulo solo**, quello che risponde al pain che hanno appena nominato. Mai la visita guidata completa: si esce senza che si ricordino niente.
3. **3 min — Prezzo**, con l'aritmetica della provvigione fatta con i loro numeri.
4. **5 min — Obiezioni e Trial.** Chiudi sempre sull'attivazione del Trial: gratuito, senza carta, e ci risentiamo fra una settimana con i loro dati dentro.

**La domanda che apre più trattative di qualunque slide:**

> *"Quando le arriva una richiesta da Immobiliare.it mentre è in visita — chi risponde, e dopo quanto?"*
