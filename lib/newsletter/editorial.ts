import type { EmailBlock } from "@/lib/email/layout";

/**
 * Calendario editoriale della newsletter.
 *
 * # Tre pilastri a rotazione
 *
 * - **Automazioni** — come funzionano, e cosa cambiano nel lavoro quotidiano.
 * - **Casi operativi** — un flusso di lavoro completo, dall'ingresso del lead
 *   alla visita o all'incarico.
 * - **Conversione dei lead** — tecniche per trasformare le richieste di
 *   informazioni in appuntamenti.
 *
 * La rotazione dipende dal numero progressivo dell'invio, non dal calendario
 * (`numeroPerSequenza`): un martedì saltato non sposta il pilastro successivo
 * e non ne ripete uno.
 *
 * # Regole del contenuto
 *
 * - Nessuna emoji, stesso registro sobrio delle email di servizio.
 * - Solo funzioni che il prodotto ha davvero, con il piano che le include.
 * - **Nessuna agenzia, cifra o risultato inventato presentato come reale.** I
 *   casi operativi sono scenari esemplificativi e lo dichiarano: un caso di
 *   studio con nomi e percentuali di fantasia è pubblicità ingannevole, e un
 *   agente del settore se ne accorge. Quando ci saranno casi reali, con il
 *   consenso delle agenzie, sostituiranno questi.
 *
 * Aggiungere un numero: una voce nell'array del pilastro, con `key` nuova e
 * mai riusata (la `key` è registrata su ogni campagna inviata).
 */

export type Pilastro = "automazioni" | "casi-operativi" | "conversione";

export const PILASTRI: Pilastro[] = ["automazioni", "casi-operativi", "conversione"];

export const NOME_PILASTRO: Record<Pilastro, string> = {
  automazioni: "Automazioni",
  "casi-operativi": "Casi operativi",
  conversione: "Conversione dei lead",
};

export interface NumeroNewsletter {
  key: string;
  pilastro: Pilastro;
  oggetto: string;
  anteprima: string;
  titolo: string;
  blocchi: EmailBlock[];
  /** Percorso interno all'applicazione, senza dominio. */
  cta: { label: string; path: string };
}

const SCENARIO =
  "Scenario esemplificativo costruito su un flusso di lavoro tipico: non descrive un'agenzia reale né risultati misurati.";

const AUTOMAZIONI: NumeroNewsletter[] = [
  {
    key: "automazioni-01-risposta-immediata",
    pilastro: "automazioni",
    oggetto: "Richieste dai portali: cosa succede nei primi cinque minuti",
    anteprima: "Il tempo di risposta è la prima selezione che il cliente fa tra le agenzie.",
    titolo: "Le richieste dai portali e i primi cinque minuti",
    blocchi: [
      {
        text: "Chi invia una richiesta di informazioni da un portale la invia, nella maggior parte dei casi, a più agenzie per immobili simili. La prima risposta che riceve non vince automaticamente l'incarico, ma stabilisce con chi proseguirà la conversazione.",
      },
      { subheading: "Cosa fa l'assistente IA" },
      {
        list: [
          "Riceve la richiesta dal portale tramite inoltro email o webhook e crea la scheda del lead in pipeline.",
          "Apre la conversazione su WhatsApp entro pochi secondi, anche la sera e nei giorni festivi, presentandosi a nome dell'agenzia.",
          "Pone una domanda per messaggio, saltando le informazioni che il cliente ha già indicato nella richiesta.",
          "Registra ogni risposta nella scheda: tipologia, zona, budget, necessità di mutuo, immobile da vendere, tempistiche.",
        ],
      },
      { subheading: "Cosa resta all'agente" },
      {
        text: "La decisione su come e quando intervenire. Ogni conversazione può essere presa in carico manualmente in qualsiasi momento: l'assistente si ferma e non riprende a scrivere sopra l'agente.",
      },
    ],
    cta: { label: "Configura l'inoltro dai portali", path: "/leads" },
  },
  {
    key: "automazioni-02-lettura-visure",
    pilastro: "automazioni",
    oggetto: "Visure e atti: dall'upload alla scheda immobile",
    anteprima: "Dati catastali estratti e strutturati, con verifica prima di ogni abbinamento.",
    titolo: "Visure catastali e atti: cosa viene estratto e come",
    blocchi: [
      {
        text: "La trascrizione manuale dei dati catastali è una delle attività con il più alto rapporto tra tempo impiegato e rischio di errore. Un subalterno sbagliato si scopre spesso solo in fase di rogito.",
      },
      { subheading: "Dati estratti dal documento" },
      {
        list: [
          "Intestatari e quote di proprietà.",
          "Comune, foglio, particella e subalterno.",
          "Categoria e rendita catastale.",
        ],
      },
      { subheading: "Il controllo anti-omonimia" },
      {
        text: "Quando un intestatario ha lo stesso nome di un lead in pipeline, il sistema non unisce i dati in automatico: propone l'abbinamento come da verificare. Due persone con lo stesso nome restano due persone finché un agente non conferma il contrario.",
      },
      {
        text: "Nei piani a pagamento i documenti confluiscono nel fascicolo dell'immobile o del cliente, con la checklist dei documenti mancanti e l'avviso delle scadenze a 60 giorni.",
      },
    ],
    cta: { label: "Carica una visura", path: "/documents" },
  },
  {
    key: "automazioni-03-promemoria-visite",
    pilastro: "automazioni",
    oggetto: "Visite non presentate: il promemoria che chiede conferma",
    anteprima: "Un messaggio prima dell'appuntamento, con risposta interpretata in modo deterministico.",
    titolo: "Promemoria delle visite e slot liberati",
    blocchi: [
      {
        text: "Una visita a cui il cliente non si presenta costa all'agente lo spostamento e lo slot, che avrebbe potuto essere offerto a un altro lead.",
      },
      { subheading: "Come funziona il promemoria" },
      {
        list: [
          "Per gli appuntamenti fissati dall'assistente, un messaggio WhatsApp parte con il preavviso impostato dall'agenzia, 24 ore per impostazione predefinita.",
          "Se il cliente risponde in modo inequivocabile che non potrà esserci, lo slot torna libero in agenda e la scheda riporta la disdetta.",
          "Le risposte ambigue non liberano nulla: la conversazione prosegue e l'agente valuta.",
        ],
      },
      {
        text: "I promemoria non consumano crediti operativi: la conversazione è già stata conteggiata quando è iniziata.",
      },
    ],
    cta: { label: "Imposta agende e disponibilità", path: "/settings/calendar" },
  },
  {
    key: "automazioni-04-feed-portali",
    pilastro: "automazioni",
    oggetto: "Portafoglio immobili e portali: un solo aggiornamento",
    anteprima: "Il feed XML pubblica sui portali gli immobili in vendita con incarico valido.",
    titolo: "Il feed XML verso i portali",
    blocchi: [
      {
        text: "Aggiornare lo stesso immobile su più portali significa ripetere lo stesso lavoro, con il rischio che prezzo o disponibilità non coincidano tra un annuncio e l'altro.",
      },
      { subheading: "Cosa pubblica il feed" },
      {
        list: [
          "Gli immobili in stato di vendita, con dati, descrizione e fotografie della scheda.",
          "Solo con incarico valido: alla scadenza del mandato l'immobile esce dal feed.",
          "L'indirizzo del feed è protetto da un token che il titolare può rigenerare in qualsiasi momento.",
        ],
      },
      {
        text: "Prima di attivare il feed verifica che le schede abbiano il CAP compilato: diversi portali lo richiedono per collocare l'annuncio sulla mappa.",
      },
    ],
    cta: { label: "Apri il portafoglio immobili", path: "/properties" },
  },
];

const CASI_OPERATIVI: NumeroNewsletter[] = [
  {
    key: "casi-01-richiesta-serale",
    pilastro: "casi-operativi",
    oggetto: "Caso operativo: una richiesta alle 22 e la visita del giorno dopo",
    anteprima: "Dal portale all'agenda senza intervento manuale fino al sopralluogo.",
    titolo: "Una richiesta serale e la visita del giorno successivo",
    blocchi: [
      { notice: { tone: "info", text: SCENARIO } },
      { subheading: "La situazione" },
      {
        text: "Un'agenzia con due agenti riceve una richiesta per un trilocale alle 22, da un portale. Nessuno è in ufficio.",
      },
      { subheading: "Il flusso" },
      {
        list: [
          "La richiesta arriva all'indirizzo di inoltro e la scheda del lead viene creata in pipeline.",
          "L'assistente IA scrive al cliente su WhatsApp e raccoglie zona, budget e tempistiche.",
          "Il cliente conferma di avere un mutuo già approvato: la scheda viene aggiornata.",
          "L'assistente propone gli slot liberi dell'agenda e il cliente sceglie le 11 del giorno dopo.",
          "La mattina l'agente trova l'appuntamento in agenda e la scheda completa del cliente.",
        ],
      },
      { subheading: "Il punto" },
      {
        text: "Il lavoro dell'agente inizia dalla visita e non dalla telefonata di qualificazione. Il tempo recuperato si sposta sulle attività che richiedono presenza.",
      },
    ],
    cta: { label: "Verifica la sessione WhatsApp", path: "/leads" },
  },
  {
    key: "casi-02-acquirente-venditore",
    pilastro: "casi-operativi",
    oggetto: "Caso operativo: l'acquirente che deve prima vendere",
    anteprima: "Come una domanda di qualificazione trasforma un acquirente in un possibile incarico.",
    titolo: "L'acquirente che deve prima vendere",
    blocchi: [
      { notice: { tone: "info", text: SCENARIO } },
      { subheading: "La situazione" },
      {
        text: "Un lead chiede informazioni su un quadrilocale. Durante la qualificazione dichiara di dover vendere il proprio appartamento per finanziare l'acquisto.",
      },
      { subheading: "Il flusso" },
      {
        list: [
          "La risposta viene registrata nella scheda e il lead risulta anche come potenziale venditore.",
          "L'agenzia carica la visura dell'appartamento del cliente: il sistema propone l'abbinamento tra intestatario e lead come da verificare.",
          "L'agente conferma l'abbinamento dopo aver verificato l'identità: il portafoglio del lead viene aggiornato.",
          "Il sopralluogo di valutazione viene fissato insieme alla visita del quadrilocale.",
        ],
      },
      { subheading: "Il punto" },
      {
        text: "Una richiesta di acquisto contiene spesso un incarico di vendita. Chiederlo in modo sistematico, a ogni lead, evita che l'informazione emerga solo quando il cliente l'ha già affidata a un'altra agenzia.",
      },
    ],
    cta: { label: "Apri la pipeline dei lead", path: "/leads" },
  },
  {
    key: "casi-03-report-proprietario",
    pilastro: "casi-operativi",
    oggetto: "Caso operativo: il report al proprietario dopo ogni visita",
    anteprima: "Gli appunti di fine visita diventano un report strutturato per il venditore.",
    titolo: "Il report al proprietario dopo ogni visita",
    blocchi: [
      { notice: { tone: "info", text: SCENARIO } },
      { subheading: "La situazione" },
      {
        text: "Un proprietario con incarico in esclusiva chiede aggiornamenti dopo ogni visita. L'agente ne svolge quattro nella stessa giornata.",
      },
      { subheading: "Il flusso" },
      {
        list: [
          "Dopo ogni visita l'agente detta o scrive dal telefono i propri appunti, in forma libera.",
          "Gli appunti vengono trasformati in un report strutturato: interesse emerso, obiezioni, prossimi passi.",
          "L'agente rilegge il report, lo corregge se necessario e lo invia al proprietario in PDF o su WhatsApp.",
        ],
      },
      { subheading: "Il punto" },
      {
        text: "Un proprietario informato con regolarità è meno propenso a mettere in discussione il prezzo o l'incarico. Il report richiede un minuto invece di una telefonata serale. Funzione inclusa nel piano Enterprise.",
      },
    ],
    cta: { label: "Scopri i report vocali", path: "/voice-reports" },
  },
  {
    key: "casi-04-asta",
    pilastro: "casi-operativi",
    oggetto: "Caso operativo: la perizia d'asta prima del sopralluogo",
    anteprima: "Criticità della perizia e simulazione economica prima di impegnare tempo.",
    titolo: "La perizia d'asta prima del sopralluogo",
    blocchi: [
      { notice: { tone: "info", text: SCENARIO } },
      { subheading: "La situazione" },
      {
        text: "Un investitore segnala all'agenzia un immobile all'asta e chiede un parere entro due giorni. La perizia supera le cento pagine.",
      },
      { subheading: "Il flusso" },
      {
        list: [
          "L'agente carica la perizia nel modulo Analisi e Due Diligence Aste.",
          "Il sistema riporta stato occupazionale, difformità, vincoli e importi indicati dal perito.",
          "La simulazione economica stima i costi complessivi dell'operazione a partire dal prezzo base.",
          "L'agente verifica i punti critici sul documento originale e prepara il parere per il cliente.",
        ],
      },
      { subheading: "Il punto" },
      {
        text: "L'analisi non sostituisce la verifica professionale, ma indica dove guardare. Il tempo di lettura si concentra sulle sezioni che incidono sulla decisione.",
      },
    ],
    cta: { label: "Apri Analisi e Due Diligence Aste", path: "/radar" },
  },
];

const CONVERSIONE: NumeroNewsletter[] = [
  {
    key: "conversione-01-una-domanda",
    pilastro: "conversione",
    oggetto: "Qualifica dei lead: una domanda per messaggio",
    anteprima: "Perché i questionari lunghi su WhatsApp ricevono meno risposte.",
    titolo: "Una domanda per messaggio",
    blocchi: [
      {
        text: "Un primo messaggio con cinque domande numerate ha l'aspetto di un modulo da compilare. Molti clienti rispondono solo alla prima, o rimandano la risposta.",
      },
      { subheading: "Tre indicazioni pratiche" },
      {
        list: [
          "<strong>Parti da ciò che il cliente ha scritto.</strong> Se la richiesta cita la zona, non chiederla di nuovo: chiedi il budget.",
          "<strong>Metti per ultime le domande sensibili.</strong> Mutuo e disponibilità economica ricevono risposte più precise quando la conversazione è già avviata.",
          "<strong>Chiudi con una proposta concreta.</strong> Due orari per una visita convertono meglio di una domanda aperta sulla disponibilità.",
        ],
      },
      {
        text: "L'assistente IA segue già questo ordine. Le stesse regole valgono per le conversazioni che l'agente prende in carico manualmente.",
      },
    ],
    cta: { label: "Apri le conversazioni", path: "/leads" },
  },
  {
    key: "conversione-02-lead-venditori",
    pilastro: "conversione",
    oggetto: "Lead con più immobili: come riconoscerli e trattarli",
    anteprima: "La categoria del lead indica dove concentrare il tempo dell'agenzia.",
    titolo: "Riconoscere i lead con più immobili",
    blocchi: [
      {
        text: "Non tutti i lead hanno lo stesso valore potenziale. Un acquirente senza immobili da vendere, un proprietario con un appartamento e un investitore con più unità richiedono approcci diversi.",
      },
      { subheading: "Le tre categorie in pipeline" },
      {
        list: [
          "<strong>Acquirente puro</strong>: la priorità è l'abbinamento con il portafoglio e la visita.",
          "<strong>Venditore singolo</strong>: oltre alla ricerca, c'è un possibile incarico di vendita da proporre.",
          "<strong>Multi-proprietario</strong>: due o più immobili. È il profilo da contattare per primo e con un agente senior.",
        ],
      },
      {
        text: "La categoria si aggiorna dalla conversazione, dall'inserimento manuale e dalle visure confermate. Filtrare la pipeline per categoria all'inizio della giornata aiuta a stabilire l'ordine delle telefonate.",
      },
    ],
    cta: { label: "Filtra la pipeline", path: "/leads" },
  },
  {
    key: "conversione-03-abbinamenti",
    pilastro: "conversione",
    oggetto: "Abbinamenti tra lead e portafoglio: quando proporli",
    anteprima: "Il momento migliore è subito dopo la qualificazione.",
    titolo: "Proporre gli immobili compatibili",
    blocchi: [
      {
        text: "Quando un cliente ha appena descritto cosa cerca, è nel momento di massima disponibilità a valutare una proposta. Qualche giorno dopo, la stessa proposta arriva dopo quelle di altre agenzie.",
      },
      { subheading: "Come usare gli abbinamenti" },
      {
        list: [
          "Gli abbinamenti vengono calcolati quando il lead indica criteri di ricerca e quando un nuovo immobile entra in portafoglio.",
          "Controlla gli immobili compatibili nella scheda del lead subito dopo la qualificazione.",
          "Proponi al massimo due o tre immobili, con una motivazione legata ai criteri dichiarati dal cliente.",
        ],
      },
      {
        text: "Un portafoglio aggiornato è la condizione necessaria: tipologia, metratura e prezzo incompleti riducono la precisione degli abbinamenti.",
      },
    ],
    cta: { label: "Aggiorna il portafoglio", path: "/properties" },
  },
  {
    key: "conversione-04-contenuti-annuncio",
    pilastro: "conversione",
    oggetto: "Annunci e social: lo stesso immobile, tre formati",
    anteprima: "Testo per il portale, post e script video partendo dagli stessi dati.",
    titolo: "Lo stesso immobile in tre formati",
    blocchi: [
      {
        text: "Il testo scritto per un portale non funziona su Instagram, e un post non basta per un video. Riscrivere tre volte la stessa descrizione è il motivo per cui molti immobili finiscono solo sui portali.",
      },
      { subheading: "Tre formati, un'unica fonte" },
      {
        list: [
          "<strong>Annuncio per i portali</strong>: completo, con dati tecnici e punti di forza.",
          "<strong>Post per Facebook e Instagram</strong>: breve, con l'elemento distintivo in apertura.",
          "<strong>Script per Reel</strong>: la sequenza delle inquadrature e il testo da dire.",
        ],
      },
      {
        text: "I contenuti vengono generati dai dati della scheda e restano modificabili prima della pubblicazione sulla Pagina Facebook e sull'account Instagram Business collegati. Funzione inclusa nel piano Enterprise.",
      },
    ],
    cta: { label: "Apri Social e Annunci", path: "/social" },
  },
];

const PER_PILASTRO: Record<Pilastro, NumeroNewsletter[]> = {
  automazioni: AUTOMAZIONI,
  "casi-operativi": CASI_OPERATIVI,
  conversione: CONVERSIONE,
};

/** Tutti i numeri, per i controlli (chiavi uniche, nessuna emoji). */
export const TUTTI_I_NUMERI: NumeroNewsletter[] = [...AUTOMAZIONI, ...CASI_OPERATIVI, ...CONVERSIONE];

/**
 * Numero da inviare per un progressivo (0, 1, 2, ...).
 *
 * Pilastro: `sequenza % 3`. Numero nel pilastro: quante volte quel pilastro è
 * già uscito, modulo i numeri disponibili. Con quattro numeri per pilastro il
 * ciclo completo è di dodici invii, sei settimane.
 */
export function numeroPerSequenza(sequenza: number): NumeroNewsletter {
  const progressivo = Math.max(0, Math.floor(sequenza));
  const pilastro = PILASTRI[progressivo % PILASTRI.length] ?? "automazioni";
  const numeri = PER_PILASTRO[pilastro];
  const numero = numeri[Math.floor(progressivo / PILASTRI.length) % numeri.length];
  if (!numero) throw new Error(`Nessun numero disponibile per il pilastro ${pilastro}`);
  return numero;
}

/** Numero per chiave, se esiste ancora (una campagna ripresa dopo un deploy). */
export function numeroPerChiave(key: string): NumeroNewsletter | undefined {
  return TUTTI_I_NUMERI.find((numero) => numero.key === key);
}
