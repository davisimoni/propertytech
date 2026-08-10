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
      "Chi risponde STOP viene escluso in modo permanente da ogni invio automatico, come impone il GDPR. Nemmeno una nuova richiesta dai portali riattiva i messaggi verso quel numero.",
      "I crediti WhatsApp si consumano all'avvio della conversazione, non a ogni messaggio scambiato.",
    ],
  },
  {
    id: "qr-vetrina",
    title: "3. QR per acquisire notizie",
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
    title: "4. Promemoria anti no-show",
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
    title: "5. Lettura di visure e atti",
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
    title: "6. Annunci, social e portali",
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
    id: "matching",
    title: "7. Match Perfetti",
    intro:
      "Ogni volta che entra un immobile, la piattaforma cerca fra i tuoi contatti qualificati chi potrebbe comprarlo, e ti dice perché.",
    steps: [
      {
        action: "Registra le preferenze in scheda lead",
        detail:
          "Zona, tipologia, budget minimo e massimo, superficie minima. Basta anche solo zona e budget.",
      },
      {
        action: "Guarda i risultati in Portafoglio Immobili e in Dashboard",
        detail:
          "Ogni accoppiamento riporta un punteggio e le motivazioni: budget compatibile, zona richiesta, tipologia corrispondente.",
      },
    ],
    notes: [
      "Un contatto senza preferenze registrate non partecipa al confronto. È voluto: meglio nessun suggerimento che suggerimenti casuali su cui perdere telefonate.",
    ],
  },
  {
    id: "report-vocali",
    title: "8. Report al proprietario (piano Enterprise)",
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
    title: "9. Integrazione con il gestionale",
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
    title: "10. Crediti e piani",
    intro:
      "Ogni piano include un numero di conversazioni WhatsApp al mese e un numero di documenti analizzati. Il conteggio è visibile in alto in ogni schermata.",
    notes: [
      "Il badge rosso \"Limiti raggiunti\" compare solo quando i crediti sono davvero esauriti, non quando una funzione non è compresa nel tuo piano.",
      "Il piano Trial include 15 conversazioni totali e 5 documenti, e non richiede carta di credito.",
      "Social & Annunci e Report Vocali sono esclusivi del piano Enterprise.",
    ],
  },
];
