/**
 * Contenuto della guida operativa.
 *
 * Vive separato dalla pagina così l'indice e le sezioni non possono divergere:
 * l'elenco dei capitoli in testa è generato dagli stessi dati che disegnano il
 * corpo del documento.
 */

export interface GuideStep {
  /** Cosa deve fare l'agente, all'imperativo. */
  action: string;
  /** Cosa ottiene, o cosa succede da solo dopo. */
  detail?: string;
}

export interface GuideSection {
  /** Ancora per l'indice e per i collegamenti profondi. */
  id: string;
  /**
   * Senza numero: lo mette la pagina contando le sezioni.
   *
   * I numeri erano scritti a mano dentro il titolo, e bastava inserire un
   * capitolo a meta' per avere due «8.» e nessun «9.» finche' qualcuno non
   * li risistemava tutti a valle.
   */
  title: string;
  intro: string;
  steps?: GuideStep[];
  /** Avvertenze: cose che se ignorate fanno perdere tempo o dati. */
  notes?: string[];
}

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "primi-passi",
    title: "Primi passi",
    intro:
      "Servono meno di dieci minuti per vedere la piattaforma al lavoro. Non c'è niente da installare e non devi cambiare il gestionale che usi già.",
    steps: [
      {
        action: "Collega il numero WhatsApp Business dell'agenzia",
        detail:
          "Da Qualifica Lead. Puoi collegarlo inquadrando un codice QR, oppure con le credenziali Meta Business se hai gia' un account WhatsApp Cloud API.",
      },
      {
        action: "Consegna ai portali il link che trovi in «Collegamento Portali»",
        detail:
          "Sempre in Qualifica Lead. Premi «Copia Link Webhook Portali» e incollalo dove indicato: «Istruzioni di collegamento» apre le istruzioni per Immobiliare.it, per Idealista e Casa.it e per i gestionali esterni. Si fa una volta sola, e da quel momento le notizie entrano da sole.",
      },
      {
        action: "Indica le fasce in cui fai vedere gli immobili",
        detail:
          "Da Impostazioni → Agende & Disponibilità. Senza slot liberi l'assistente non può fissare appuntamenti da solo, e la conversazione si ferma un passo prima della visita.",
      },
      {
        action: "Collega il tuo calendario, nella stessa schermata",
        detail:
          "«Connetti Google Calendar» oppure «Connetti Microsoft Outlook / Office 365». Da quel momento l'assistente non propone piu' orari in cui sei gia' occupato, e ogni visita che fissa ti compare sul calendario che usi tutti i giorni. Ogni agente collega il proprio.",
      },
      {
        action: "Carica il primo immobile o una visura",
        detail:
          "Dal modulo Social & Annunci oppure da Analisi Documenti. È il modo più rapido per capire cosa fa la piattaforma sui tuoi dati veri.",
      },
    ],
    notes: [
      "Il titolare invita i collaboratori da Impostazioni → Team. Quante persone puoi far entrare dipende dal piano: vedi «Crediti, piani e postazioni».",
      "Titolare e collaboratore non fanno le stesse cose. Restano al titolare: abbonamento e fatturazione, dati e logo dell'agenzia, scheda agenzia, feed verso i portali, gestione del team.",
      "Password dimenticata: dalla schermata di accesso. Il link vale un'ora e si usa una volta sola.",
    ],
  },
  {
    id: "notizie-whatsapp",
    title: "Filtro notizie su WhatsApp",
    intro:
      "L'assistente risponde in pochi secondi a chi scrive dai portali, a qualsiasi ora. Chiede una cosa alla volta — prima cosa cerca e dove, poi il budget, poi mutuo, vendita e tempistiche — e propone gli orari liberi della tua agenda.",
    steps: [
      {
        action: "Guarda la pipeline in Qualifica Lead",
        detail:
          "La tabella mostra ogni contatto con il suo stato. Il pannello di dettaglio contiene la conversazione completa e la scheda di qualificazione.",
      },
      {
        action: "Passa alla vista Pipeline per lavorare per fasi",
        detail:
          "La board a colonne — Nuovo, Qualificato, Visita, Proposta, Chiuso — si aggiorna trascinando le schede o dal selettore su ciascuna.",
      },
      {
        action: "Prova l'assistente prima di collegarlo",
        detail:
          "La scheda \"Testa l'AI\" simula una conversazione senza inviare nulla a nessuno e senza consumare crediti.",
      },
    ],
    notes: [
      "Se il contatto risponde con una nota vocale, viene trascritta e la qualificazione prosegue senza interruzioni. Se l'audio non si capisce, l'assistente chiede di scrivere invece di restare in silenzio.",
      "Zona, tipologia, budget e metratura finiscono da soli nelle «Preferenze di ricerca» della scheda, mentre la conversazione va avanti: non devi ribatterli a mano. Se correggi un campo, la tua correzione vince e non viene sovrascritta.",
      "Appena quei criteri cambiano, gli immobili compatibili in portafoglio si ricalcolano subito. L'email di segnalazione parte però solo a qualificazione conclusa: durante la conversazione i criteri si assestano turno dopo turno, e un avviso a ogni assestamento diventerebbe rumore.",
      "Se il cliente risponde in modo vago l'assistente propone due o tre fasce fra cui scegliere. Dopo la seconda risposta vaga sullo stesso punto lascia perdere e prosegue: insistere una terza volta fa chiudere la conversazione.",
      "Chi scrive per VENDERE viene riconosciuto dal primo messaggio e segue un percorso suo: dove si trova l'immobile, com'e' fatto, entro quando vuole vendere e la disponibilita' per un sopralluogo. A un venditore non viene mai chiesto un budget d'acquisto. In elenco lo riconosci dal badge «Incarico».",
      "L'assistente non da' mai una valutazione, nemmeno indicativa, nemmeno se il proprietario insiste: rimanda al sopralluogo gratuito. Una cifra detta per messaggio diventa l'aspettativa su cui poi ti tocca trattare al ribasso.",
      "Chi risponde STOP viene escluso in modo permanente da ogni invio automatico, come impone il GDPR. Nemmeno una nuova richiesta dai portali riattiva i messaggi verso quel numero.",
      "L'assistente fissa l'appuntamento da solo. Il cliente puo' scegliere fra gli orari proposti oppure indicarne uno suo (\"domani alle 11:40\"): se cade in una fascia libera viene confermato subito, altrimenti riceve i due o tre orari liberi piu' vicini a quello che aveva chiesto.",
      "Gli orari proposti tengono conto sia delle fasce che hai aperto in Impostazioni → Agende sia degli impegni reali sul tuo Google o Outlook collegato: l'assistente non propone un orario in cui sei gia' occupato.",
      "A visita fissata trovi l'evento sul tuo calendario, la scheda passa a «Visita Programmata» e l'appuntamento compare fra le prossime visite in Dashboard.",
      "Partono anche due email di conferma: una a te (o all'agente assegnato) con i dati del contatto e le sue preferenze, e una al cliente. Quella al cliente parte solo se conosciamo il suo indirizzo — l'assistente lo raccoglie se il cliente lo scrive, ma non lo chiede apposta: la conferma vera l'ha gia' ricevuta su WhatsApp.",
      "I crediti WhatsApp si consumano all'avvio della conversazione, non a ogni messaggio scambiato.",
    ],
  },
  {
    id: "handover",
    title: "Prendere in mano una conversazione",
    intro:
      "L'assistente lavora da solo, ma la conversazione resta tua: puoi fermarlo in qualsiasi momento, e in alcuni casi si ferma da sé.",
    steps: [
      {
        action: "Scrivi !pausa nella chat, oppure usa l'interruttore in scheda",
        detail:
          "L'assistente smette di rispondere a quel contatto. I messaggi continuano ad arrivare e restano in cronologia, così ritrovi tutto quello che il cliente ha scritto mentre rispondevi tu.",
      },
      {
        action: "Scrivi !riprendi quando hai finito",
        detail:
          "L'assistente torna a lavorare dal messaggio successivo. Funziona anche dal pulsante nella scheda del contatto.",
      },
    ],
    notes: [
      "Dopo DUE messaggi consecutivi che non riguardano immobili — un messaggio personale, una pubblicità, un numero sbagliato — l'assistente si sospende da solo su quel contatto e ti avvisa via email. Il contatore si azzera a ogni messaggio pertinente.",
      "Il filtro è tarato per lasciar passare nel dubbio: un \"Buongiorno\" o una frase ambigua vengono trattati come richieste vere. Meglio una risposta di troppo che il silenzio davanti a un cliente.",
      "Il comando funziona solo se scritto da solo: una frase che contiene !pausa in mezzo ad altro resta un messaggio normale e viene inviata al cliente.",
    ],
  },
  {
    id: "qr-vetrina",
    title: "QR per acquisire notizie",
    intro:
      "Il codice che trovi in Qualifica Lead apre WhatsApp sul tuo numero con un messaggio già scritto. Stampalo in vetrina, sui cartelli degli immobili e sui volantini.",
    steps: [
      {
        action: "Scegli l'immobile dalla tendina, se il QR va su un cartello",
        detail:
          "Il riferimento finisce da solo nel messaggio precompilato e il QR si aggiorna mentre guardi. Chi lo inquadra scrive citando quell'immobile, e l'assistente risponde con i dati veri — prezzo, metratura, zona — invece di chiedere di quale casa si tratti a una persona che ha il cartello davanti.",
      },
      {
        action: "Scarica il PNG o stampa direttamente",
        detail: "L'immagine è ad alta correzione d'errore: regge sporco, sole e inquadrature storte.",
      },
    ],
    notes: [
      "Chi scansiona e scrive diventa una notizia con fonte \"QR in vetrina\", distinta dai portali: così vedi se quel cartello sta davvero producendo contatti.",
      "Senza immobile selezionato il messaggio resta generico e va bene per la vetrina o un volantino: l'assistente chiede lui cosa si sta cercando.",
      "L'assistente riferisce solo i dati che hai in scheda. Su ciò che non c'è — spese condominiali, anno di costruzione, trattabilità del prezzo — dice che ci pensi tu, invece di inventare un numero su un immobile vero.",
    ],
  },
  {
    id: "sicurezza-whatsapp",
    title: "Sicurezza WhatsApp e prevenzione dei blocchi",
    intro:
      "La piattaforma e' costruita per rispondere a chi scrive per primo all'agenzia: e' il traffico che WhatsApp considera legittimo. Cosa facciamo noi per proteggere il tuo numero, e le quattro regole che restano in mano tua.",
    steps: [
      {
        action: "Non serve che tu faccia nulla: due protezioni sono automatiche",
        detail:
          "L'assistente attende qualche secondo prima di rispondere, come farebbe una persona che legge e digita: una risposta istantanea e' la firma di un programma, e WhatsApp classifica i numeri anche su questo. In piu' non invia mai piu' di tre messaggi al minuto allo stesso contatto, cosi' un eventuale anello di ripetizione si spezza da solo invece di girare finche' qualcuno se ne accorge.",
      },
      {
        action: "1. Niente invii massivi dal numero collegato",
        detail:
          "Il numero serve a rispondere alle richieste in arrivo. Usarlo per liste fredde, campagne o inoltri massivi e' il modo piu' rapido per farlo segnalare: bastano poche persone che premono \"Blocca\" perche' WhatsApp intervenga, e a quel punto perdi tutte le conversazioni in corso, non solo la campagna.",
      },
      {
        action: "2. Usa l'app WhatsApp Business con il profilo compilato",
        detail:
          "Nome dell'agenzia, indirizzo, orari, sito e categoria. Un profilo completo e' un segnale di legittimita' e, soprattutto, e' cio' che vede il cliente prima di decidere se fidarsi a rispondere.",
      },
      {
        action: "3. Se il numero e' nuovo, vai piano per due settimane",
        detail:
          "Un numero attivato da meno di quattordici giorni e' quello che WhatsApp osserva piu' da vicino. Sotto le cinquanta conversazioni al giorno in quel periodo: il volume si alza da solo man mano che il numero si consolida.",
      },
      {
        action: "4. Prendi il controllo quando serve",
        detail:
          "Scrivi !pausa nella chat, o usa l'interruttore nella scheda del contatto, per fermare l'assistente su quella conversazione; !riprendi lo riattiva. E' lo strumento da usare quando una conversazione si fa delicata, invece di lasciare che l'automatismo ci provi.",
      },
    ],
    notes: [
      "Il collegamento tramite codice QR usa un client NON ufficiale. Funziona bene e si attiva in due minuti, ma Meta puo' limitare o sospendere i numeri che ne fanno uso: per un impiego intensivo e continuativo la strada solida e' WhatsApp Cloud API.",
      "Chi risponde STOP esce in modo permanente da ogni invio automatico. Non e' una preferenza che puoi ignorare: e' un obbligo di legge, e insistere su chi ha revocato il consenso e' anche il comportamento che porta piu' segnalazioni.",
      "Se il numero si scollega ricevi subito un'email: fino alla riconnessione i lead che scrivono non ricevono risposta.",
    ],
  },
  {
    id: "promemoria",
    title: "Promemoria anti no-show",
    intro:
      "Prima di ogni visita l'assistente scrive al cliente per confermare. Se risponde NO, lo slot torna libero in agenda e la scheda segna la disdetta.",
    steps: [
      {
        action: "Scegli l'anticipo da Impostazioni → Integrazione Gestionale",
        detail: "Da 2 a 48 ore prima dell'appuntamento. Il valore predefinito è 24 ore.",
      },
    ],
    notes: [
      "La risposta viene interpretata solo se breve e inequivocabile. Un \"non lo so\" non libera l'agenda: prosegue la conversazione normale.",
      "I promemoria non consumano crediti: la conversazione è già stata pagata all'ingaggio.",
    ],
  },
  {
    id: "visure",
    title: "Lettura di visure e atti",
    intro:
      "Carichi il PDF e ottieni intestatari, quote di proprietà, foglio, particella, subalterno, categoria e rendita già in chiaro, più una sintesi di due righe su cosa manca o non torna.",
    steps: [
      {
        action: "Trascina il PDF in Analisi Documenti",
        detail: "Visura catastale, planimetria, atto di provenienza o APE, fino a 15 MB.",
      },
      {
        action: "Correggi a mano quello che serve",
        detail:
          "I campi sono modificabili: su una scansione storta l'AI può leggere male una cifra, e il numero giusto lo conosci tu.",
      },
      {
        action: "Scarica la scheda in PDF con il tuo logo",
        detail: "Da Impostazioni puoi caricare logo e ragione sociale, che compaiono in intestazione.",
      },
    ],
    notes: [
      "Se un intestatario della visura coincide con un contatto in archivio, la piattaforma te lo segnala ma non unisce niente da sola: l'omonimia è frequente e la conferma resta tua.",
    ],
  },
  {
    id: "fascicolo",
    title: "Fascicolo documentale",
    intro:
      "L'archivio dei documenti di un incarico, dentro la scheda a cui appartengono: quello dell'immobile nel Portafoglio Immobili, quello del cliente nella scheda del contatto. Serve a due cose che una cartella condivisa non fa — dirti cosa manca prima del rogito, e avvisarti prima che un documento scada.",
    steps: [
      {
        action: "Apri la scheda e vai al Fascicolo",
        detail:
          "Sull'immobile lo trovi nella card del Portafoglio; sul cliente dentro la sua conversazione. Trascina il file o scegli «Carica documento».",
      },
      {
        action: "Scegli di che documento si tratta",
        detail:
          "Incarico di mediazione, visura, planimetria, atto di provenienza, APE, conformità impianti, proposta, preliminare, identità, codice fiscale. È da questa scelta che dipende tutto il resto: la casella nell'elenco di cosa manca, e se ti viene chiesta la scadenza.",
      },
      {
        action: "Metti la scadenza quando te la chiede",
        detail:
          "Il campo compare solo per i documenti che scadono davvero — APE, conformità impianti, incarico e proposta. Sugli altri non compare apposta: una scadenza inventata su un atto di provenienza è peggio di nessuna scadenza.",
      },
      {
        action: "Guarda «Manca un documento»",
        detail:
          "L'elenco confronta quello che hai caricato con quello che serve per andare dal notaio: sull'immobile incarico, visura, planimetria, atto di provenienza, APE e conformità impianti; sul cliente identità e codice fiscale. È la parte che ti fa scoprire il buco settimane prima del rogito, non il giorno stesso.",
      },
    ],
    notes: [
      "L'avviso di scadenza arriva sessanta giorni prima, non trenta: rifare un APE richiede settimane, e un avviso che arriva a rogito già fissato non serve a niente.",
      "Ogni documento nasce con una conservazione di dieci anni, come impone la legge antiriciclaggio agli agenti immobiliari. Il termine viene calcolato al caricamento e resta quello, anche se la norma cambia dopo.",
      "Puoi cancellare quello che vuoi — i dati sono tuoi, e un cliente può chiederti di rimuovere i suoi — ma su un documento ancora in conservazione ti viene chiesta una conferma. Serve a fermare il clic sbagliato, non la decisione presa.",
      "Si caricano PDF, JPEG, PNG e WebP fino a 5 MB. Per ora è pensato per la singola scansione, non per riversarci l'archivio storico dell'agenzia.",
      "Il Fascicolo è incluso dal piano Starter in su. Non c'è nel Trial: una conservazione decennale promessa su un account di prova che può sparire in due settimane non avrebbe senso.",
      "NON è uno strumento di conformità antiriciclaggio e non certifica niente. Ti aiuta a tenere in ordine i documenti e a non farteli scadere; la valutazione del rischio, la segnalazione alla UIF e la responsabilità di quanto dichiari restano tue.",
    ],
  },
  {
    id: "annunci",
    title: "Annunci, social e portali",
    intro:
      "Da quattro righe sull'immobile — o dal link di un annuncio già online — ottieni il testo per i portali, il post per Instagram e Facebook e lo script del Reel scena per scena.",
    steps: [
      {
        action: "Da link — per il tuo sito, i portali locali e il gestionale",
        detail:
          "Incolla l'indirizzo e premi «Estrai da Link». È la via più rapida quando l'annuncio è già online: sito della tua agenzia, portali locali, schede pubblicate dal gestionale, siti dei costruttori. Legge anche le pagine che si compongono da sole dopo l'apertura.",
      },
      {
        action: "Da testo — la strada certa per Immobiliare.it e Idealista",
        detail:
          "Quei due portali respingono le letture automatiche: non perdere il tentativo col link. Seleziona il testo dell'annuncio, incollalo nel riquadro sotto e premi «Genera». Funziona sempre, ed è anche l'unico modo di partire da un'email, un PDF o una scheda del gestionale. Non devi premere altro prima: i campi della scheda di portafoglio si riempiono da soli subito dopo.",
      },
      {
        action: "Riempi i dati per i portali e salva in portafoglio",
        detail:
          "Riferimento, contratto, tipologia, comune, prezzo e superficie sono obbligatori: senza, nessun portale accetta l'annuncio in caricamento.",
      },
      {
        action: "Mettilo «In vendita» quando la scheda e' a posto",
        detail:
          "Un immobile appena salvato nasce come BOZZA e resta fuori dai portali: puo' avere il prezzo sbagliato o nessuna fotografia, e ritirare un annuncio gia' online costa molto piu' di un clic. Dal Portafoglio Immobili scegli «In vendita» dal menu della scheda: da quel momento entra nel feed alla lettura successiva.",
      },
    ],
    notes: [
      "Il feed XML si configura UNA volta sola: da Portafoglio Immobili copi l'indirizzo con «Copia Indirizzo Feed XML» e lo consegni al referente del portale. Da li' in poi rilegge da solo, e ogni immobile che marchi «In vendita» compare senza che tu faccia altro.",
      "Il pannello del feed dice quanti immobili sta pubblicando e quanti sono ancora in bozza: se il portale ti sembra vuoto, e' li' che si vede il perche'.",
      "Quando un portale rifiuta la lettura del link te lo diciamo e ti portiamo il cursore nel riquadro del testo. Non è un guasto della piattaforma: è quel sito che non si lascia leggere da un programma.",
      "L'AI usa soltanto ciò che trova nella fonte. Se un dato non c'è il campo resta vuoto invece di essere inventato: rileggi sempre prezzo e metratura prima di pubblicare.",
    ],
  },
  {
    id: "incarichi",
    title: "Incarichi, provvigioni e chiavi",
    intro:
      "Nella scheda di ogni immobile puoi registrare i dati del mandato. Sono facoltativi, ma la scadenza governa la pubblicazione sui portali.",
    steps: [
      {
        action: "Apri Portafoglio Immobili e premi Modifica sulla scheda",
        detail:
          "La sezione \"Dati mandato e incarico\" e' separata dal resto: tipo di incarico (esclusiva, non esclusivo, selezione), data di scadenza, provvigione e chiavi.",
      },
      {
        action: "Scrivi la provvigione con i decimali se servono",
        detail:
          "Accetta sia 3,5 sia 3.5. Le mezze percentuali sono la norma e non vengono arrotondate.",
      },
      {
        action: "Indica dove sono le chiavi",
        detail:
          "L'interruttore \"Chiavi in agenzia\" apre un campo libero per l'ubicazione: cassetta 12, dal portiere, le ha il proprietario.",
      },
    ],
    notes: [
      "Un incarico SCADUTO esce automaticamente dal feed verso i portali, anche se l'immobile risulta ancora in vendita: senza mandato valido l'agenzia non ha titolo per pubblicizzarlo.",
      "Una scheda SENZA data di scadenza non viene toccata. E' un mandato non ancora registrato, non uno scaduto, e trattarli allo stesso modo toglierebbe dai portali immobili perfettamente regolari.",
      "Nella card compare un avviso: ambra entro trenta giorni, rosso a scadenza superata. Ogni mattina il titolare riceve un riepilogo via email degli incarichi in scadenza a sessanta e trenta giorni.",
      "Sul selettore di stato: \"In vendita\" e \"Sotto proposta\" restano pubblicati — un compromesso non e' un rogito, e ritirare l'annuncio durante la trattativa lascia senza alternative se salta. Bozza, Venduto e Archiviato non vengono pubblicati.",
    ],
  },
  {
    id: "matching",
    title: "Abbinamento clienti e immobili",
    intro:
      "L'abbinamento funziona nelle due direzioni: quando entra un immobile la piattaforma cerca chi potrebbe comprarlo, e quando un contatto finisce la qualificazione passa in rassegna tutto il portafoglio.",
    steps: [
      {
        action: "Registra le preferenze in scheda lead",
        detail:
          "Zona, tipologia, budget minimo e massimo, superficie minima. Basta anche solo zona e budget.",
      },
      {
        action: "Guarda i risultati da entrambi i lati",
        detail:
          "\"Immobili compatibili\" nella scheda del contatto, \"Clienti interessati\" nella scheda dell'immobile. Ogni accoppiamento riporta un punteggio e le motivazioni: budget compatibile, zona richiesta, tipologia corrispondente.",
      },
      {
        action: "Proponi la casa con un tocco",
        detail:
          "Sotto ogni abbinamento, il pulsante \"Proponi via WhatsApp\" invia un messaggio gia' composto con tipologia, zona, metratura, prezzo e riferimento. Il testo e' costruito dai dati della scheda, non generato: sai esattamente cosa riceve il cliente.",
      },
    ],
    notes: [
      "Sopra l'80% di compatibilita' l'agente assegnato riceve un'email con l'elenco degli immobili, ordinato per punteggio. Solo per gli abbinamenti nuovi: un ricalcolo non ripropone quello che avevi gia' visto.",
      "L'invio della proposta NON consuma crediti: la conversazione con quel contatto e' gia' stata pagata quando e' stata avviata.",
      "Un immobile venduto, in bozza o con l'incarico scaduto non viene mai proposto.",
      "Un contatto senza preferenze registrate non partecipa al confronto. È voluto: meglio nessun suggerimento che suggerimenti casuali su cui perdere telefonate.",
    ],
  },
  {
    id: "radar",
    title: "Radar Immobili & Aste",
    intro:
      "Le occasioni che stai seguendo — aste giudiziarie e ribassi di mercato — con la perizia letta dall'AI, i conti già fatti e i clienti in pipeline che potrebbero comprarle.",
    steps: [
      {
        action: "Registra il lotto e carica la perizia",
        detail:
          "Comune, tipologia, prezzo e metratura bastano per cominciare; indirizzo e civico spostano il segnaposto sulla mappa dal centro del paese al portone. La perizia in PDF viene letta in secondo piano: puoi chiudere la scheda e tornare dopo.",
      },
      {
        action: "Leggi il semaforo dei rischi",
        detail:
          "Verde, giallo o rosso su stato occupazionale, difformità edilizie, vincoli e costi di sanatoria. Nel dubbio il colore resta giallo: è un punto da verificare di persona, non un via libera.",
      },
      {
        action: "Fai due conti nel simulatore",
        detail:
          "Prezzo, oneri di trasferimento, ristrutturazione e valore di mercato danno margine potenziale e rendimento da locazione. Sono stime lorde: non comprendono imposte, tempi di rilascio né spese legali.",
      },
      {
        action: "Guarda chi potrebbe comprarlo",
        detail:
          "Aprendo la scheda «Lead compatibili» l'incrocio con i contatti in pipeline parte da solo. Ogni abbinamento riporta punteggio e motivazioni: budget, zona, tipologia.",
      },
      {
        action: "Proponi al cliente, dopo averlo letto",
        detail:
          "Il messaggio WhatsApp si apre in anteprima e parte solo se lo confermi tu. Due versioni: una per il compratore finale e una per l'investitore, che include i numeri del business plan.",
      },
    ],
    notes: [
      "Quando il prezzo di un lotto che segui cala, la scheda si marca «Ribassato» con la percentuale. Se il nuovo prezzo fa rientrare l'immobile nel budget di clienti che prima non lo raggiungevano, accanto trovi quanti sono: è il momento in cui conviene richiamarli, non il giorno dell'asta.",
      "Il messaggio che vedi in anteprima è esattamente quello che parte: è composto dal server, non ricostruito dal browser.",
      "Il copy per i social non contiene mai margine, semaforo dei rischi o difformità: sono informazioni tue, non del pubblico.",
      "Il semaforo e i conti sono uno strumento di lavoro, non una perizia. La verifica in cancelleria e il sopralluogo restano necessari prima di qualunque offerta.",
    ],
  },
  {
    id: "report-vocali",
    title: "Report al proprietario (piano Enterprise)",
    intro:
      "Finita la visita parli trenta secondi al telefono, come faresti con un collega. Ricevi un report professionale per il proprietario, pronto da inviare.",
    steps: [
      {
        action: "Registra la nota vocale o scrivi il testo",
        detail: "Il percorso testuale funziona sempre; quello audio richiede il servizio di trascrizione attivo.",
      },
      {
        action: "Rivedi il report e invialo",
        detail:
          "I commenti dei visitatori vengono riformulati in modo chiaro ma mai offensivo. Puoi scaricarlo in PDF con il tuo logo.",
      },
    ],
    notes: [
      "La registrazione audio non viene mai conservata: si usa per produrre la trascrizione e viene scartata. Restano solo il testo e il report.",
    ],
  },
  {
    id: "gestionale",
    title: "Integrazione con il gestionale",
    intro:
      "I contatti qualificati possono arrivare da soli nel gestionale che usi già, senza doppio inserimento.",
    steps: [
      {
        action: "Incolla l'indirizzo webhook del tuo gestionale",
        detail:
          "Da Impostazioni → Integrazione Gestionale. Funziona con Zapier, Make, Gestim o qualsiasi API esterna. Il pulsante \"Invia test\" verifica subito che risponda.",
      },
      {
        action: "Oppure esporta in CSV",
        detail:
          "Filtrabile per intervallo di date, categoria venditore e soli qualificati. Il file si apre direttamente in Excel.",
      },
    ],
    notes: [
      "Ogni invio è firmato: il tuo gestionale può verificare l'header X-PropertyTech-Signature per accertarsi che la chiamata arrivi davvero da noi.",
    ],
  },
  {
    id: "crediti",
    title: "Crediti, piani e postazioni",
    intro:
      "Ogni piano include un numero di conversazioni WhatsApp al mese, un numero di documenti analizzati e un numero di postazioni, cioè di persone che possono entrare. Il conteggio è visibile in alto in ogni schermata.",
    steps: [
      {
        action: "Invita i collaboratori da Impostazioni → Team",
        detail:
          "Ricevono un'email con il link per scegliere la password. L'invito vale sette giorni e puoi rinviarlo o annullarlo.",
      },
      {
        action: "Controlla le postazioni rimaste prima di invitare",
        detail:
          "Trial e Starter ne hanno una — quella del titolare — Professional tre, Enterprise nessun limite. Se sono finite l'invito non parte e ti viene detto perché: si sale di piano.",
      },
    ],
    notes: [
      "Anche gli inviti ancora da accettare occupano una postazione. Altrimenti basterebbe mandarne dieci di fila per superare il limite, e i primi ad accorgersene sarebbero i colleghi rimasti fuori.",
      "Abbonamento, fatturazione e cambio piano sono riservati al titolare: un collaboratore non vede nemmeno la scheda.",
      "Il badge rosso \"Limiti raggiunti\" compare solo quando i crediti sono davvero esauriti, non quando una funzione non è compresa nel tuo piano.",
      "Il piano Trial include 15 conversazioni totali — non al mese — e 5 documenti, e non richiede carta di credito.",
      "Le conversazioni incluse: 150 al mese con Starter, 500 con Professional, 2.500 con Enterprise, che è l'unico piano in cui oltre l'incluso si prosegue a 0,05 € a conversazione invece di fermarsi.",
      "L'analisi dei documenti è illimitata su tutti i piani a pagamento; il Trial ne include cinque.",
      "Social & Annunci e Report Vocali sono esclusivi del piano Enterprise. Il Fascicolo documentale è incluso da Starter in su.",
    ],
  },
];
