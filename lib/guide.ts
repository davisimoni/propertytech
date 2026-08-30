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
  title: string;
  intro: string;
  steps?: GuideStep[];
  /** Avvertenze: cose che se ignorate fanno perdere tempo o dati. */
  notes?: string[];
}

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "primi-passi",
    title: "1. Primi passi",
    intro:
      "Servono meno di dieci minuti per vedere la piattaforma al lavoro. Non c'è niente da installare e non devi cambiare il gestionale che usi già.",
    steps: [
      {
        action: "Collega il numero WhatsApp Business dell'agenzia",
        detail:
          "Da Qualifica Lead inserisci le credenziali Meta Business. Copia l'indirizzo webhook che ti mostriamo e consegnalo a Immobiliare.it, Idealista o al tuo gestionale: da quel momento le notizie entrano in automatico.",
      },
      {
        action: "Indica le fasce in cui fai vedere gli immobili",
        detail:
          "Da Impostazioni → Agende. Senza slot liberi l'assistente non può fissare appuntamenti da solo, e la conversazione si ferma un passo prima della visita.",
      },
      {
        action: "Carica il primo immobile o una visura",
        detail:
          "Dal modulo Social & Annunci oppure da Analisi Documenti. È il modo più rapido per capire cosa fa la piattaforma sui tuoi dati veri.",
      },
    ],
    notes: [
      "Il titolare invita i collaboratori da Impostazioni → Team: l'agente riceve un'email con il link per scegliere la propria password. L'invito vale sette giorni e si puo' rinviare o annullare.",
      "Titolare e collaboratore non fanno le stesse cose. Restano al titolare: abbonamento e fatturazione, dati e logo dell'agenzia, scheda agenzia, feed verso i portali, gestione del team.",
      "Password dimenticata: dalla schermata di accesso. Il link vale un'ora e si usa una volta sola.",
    ],
  },
  {
    id: "notizie-whatsapp",
    title: "2. Filtro notizie su WhatsApp",
    intro:
      "L'assistente risponde in pochi secondi a chi scrive dai portali, a qualsiasi ora. Pone tre domande — mutuo o liquidità, immobile da vendere prima, tempistiche — e propone gli orari liberi della tua agenda.",
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
      "Zona e budget vengono raccolti solo se il cliente li nomina da solo: non glieli chiediamo, perché una quarta domanda allungherebbe la qualificazione proprio dove le persone smettono di rispondere.",
      "Chi risponde STOP viene escluso in modo permanente da ogni invio automatico, come impone il GDPR. Nemmeno una nuova richiesta dai portali riattiva i messaggi verso quel numero.",
      "I crediti WhatsApp si consumano all'avvio della conversazione, non a ogni messaggio scambiato.",
    ],
  },
  {
    id: "handover",
    title: "3. Prendere in mano una conversazione",
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
    title: "4. QR per acquisire notizie",
    intro:
      "Il codice che trovi in Qualifica Lead apre WhatsApp sul tuo numero con un messaggio già scritto. Stampalo in vetrina, sui cartelli degli immobili e sui volantini.",
    steps: [
      {
        action: "Personalizza il messaggio precompilato",
        detail:
          "Se il QR finisce sul cartello di un immobile, aggiungi il riferimento: comparirà nella scheda della notizia e saprai da quale immobile arriva il contatto.",
      },
      {
        action: "Scarica il PNG o stampa direttamente",
        detail: "L'immagine è ad alta correzione d'errore: regge sporco, sole e inquadrature storte.",
      },
    ],
    notes: [
      "Chi scansiona e scrive diventa una notizia con fonte \"QR in vetrina\", distinta dai portali: così vedi se quel cartello sta davvero producendo contatti.",
    ],
  },
  {
    id: "promemoria",
    title: "5. Promemoria anti no-show",
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
    title: "6. Lettura di visure e atti",
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
    id: "annunci",
    title: "7. Annunci, social e portali",
    intro:
      "Da quattro righe sull'immobile — o dal link di un annuncio già online — ottieni il testo per i portali, il post per Instagram e Facebook e lo script del Reel scena per scena.",
    steps: [
      {
        action: "Compila i dati o incolla il link",
        detail:
          "Dall'URL l'AI estrae zona, superficie, locali e prezzo, e precompila i campi al posto tuo.",
      },
      {
        action: "Riempi i dati per i portali e salva in portafoglio",
        detail:
          "Riferimento, contratto, tipologia, comune, prezzo e superficie sono obbligatori: senza, nessun portale accetta l'annuncio in caricamento.",
      },
      {
        action: "Scarica il feed XML",
        detail:
          "Un solo immobile o l'intero portafoglio. Fai validare il tracciato dal referente del portale prima del primo caricamento massivo: ogni portale ha il suo.",
      },
    ],
  },
  {
    id: "incarichi",
    title: "8. Incarichi, provvigioni e chiavi",
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
    title: "9. Abbinamento clienti e immobili",
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
    id: "report-vocali",
    title: "10. Report al proprietario (piano Enterprise)",
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
    title: "11. Integrazione con il gestionale",
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
    title: "12. Crediti e piani",
    intro:
      "Ogni piano include un numero di conversazioni WhatsApp al mese e un numero di documenti analizzati. Il conteggio è visibile in alto in ogni schermata.",
    notes: [
      "Il badge rosso \"Limiti raggiunti\" compare solo quando i crediti sono davvero esauriti, non quando una funzione non è compresa nel tuo piano.",
      "Il piano Trial include 15 conversazioni totali e 5 documenti, e non richiede carta di credito.",
      "Social & Annunci e Report Vocali sono esclusivi del piano Enterprise.",
    ],
  },
];
