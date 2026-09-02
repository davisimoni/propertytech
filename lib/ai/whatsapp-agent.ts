import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { PropertyType } from "@prisma/client";
import type { ChatMessage } from "@/lib/whatsapp/types";
import { PRIVACY_DISCLOSURE } from "@/lib/whatsapp/compliance";
import { PROPERTY_TYPES } from "@/lib/listings/property-fields";

/**
 * Timeout esplicito, e piu' corto del budget della funzione.
 *
 * Questo agente gira dentro il webhook WhatsApp, che ha `maxDuration = 60`.
 * L'SDK, lasciato ai suoi valori predefiniti, attende molto piu' a lungo: la
 * piattaforma uccideva la funzione prima che la chiamata rinunciasse, e
 * `AGENT_FALLBACK_MESSAGE` — che esiste proprio perche' il cliente non resti
 * mai senza risposta — non faceva in tempo a partire. Trenta secondi lasciano
 * margine per generare il ripiego, scriverlo in cronologia e inviarlo.
 */
const AGENT_TIMEOUT_MS = 30_000;

const client = new Anthropic({ timeout: AGENT_TIMEOUT_MS, maxRetries: 1 });

const AGENT_MODEL = "claude-opus-5";

export { QUALIFICATION_QUESTIONS } from "@/lib/whatsapp/questions";

export const agentReplySchema = z.object({
  reply: z
    .string()
    .describe(
      "Il messaggio WhatsApp da inviare al cliente, in italiano impeccabile, massimo 2-3 frasi brevi."
    ),
  mortgageApproved: z
    .boolean()
    .nullable()
    .describe(
      "true se il cliente ha delibera del mutuo OPPURE liquidità immediata; false se non ha ancora copertura finanziaria; null se non ancora emerso dalla conversazione."
    ),
  mustSellFirst: z
    .boolean()
    .nullable()
    .describe(
      "true se il cliente deve vendere un altro immobile prima di acquistare; false se non deve farlo; null se non ancora emerso."
    ),
  timeframe: z
    .string()
    .nullable()
    .describe(
      "Tempistica di acquisto dichiarata dal cliente, sintetizzata (es. 'entro 3 mesi', 'oltre 12 mesi'); null se non ancora emersa."
    ),
  budget: z
    .string()
    .nullable()
    .describe("Budget dichiarato dal cliente, se menzionato spontaneamente; altrimenti null."),
  /*
   * Preferenze di ricerca: ciò che alimenta lo Smart Match.
   *
   * # Cosa è cambiato, e perché è un cambio di rotta
   *
   * Prima zona e budget si **raccoglievano soltanto** se il cliente li
   * nominava da solo, e tipologia e metratura non si estraevano affatto. La
   * ragione era la lunghezza del percorso: ogni domanda in più è gente che
   * smette di rispondere.
   *
   * Il costo di quella scelta però si vedeva a valle. Un contatto arrivato da
   * WhatsApp restava quasi sempre senza criteri, e un lead senza criteri **non
   * partecipa al matching**: l'agenzia si ritrovava un portafoglio pieno e una
   * pipeline di persone qualificate che nessun immobile raggiungeva mai.
   *
   * Ora si chiedono, una per messaggio e in ordine di importanza. Il rischio
   * di abbandono resta reale ed è il motivo dell'ordine: prima ciò che serve
   * al matching, i dettagli per ultimi, così anche una conversazione
   * interrotta a metà lascia qualcosa di utilizzabile.
   */
  preferredZone: z
    .string()
    .nullable()
    .describe(
      "Zona, quartiere o comune che il cliente cerca (es. 'Navigli', 'Vignola centro'). null finché non emerge."
    ),
  preferredType: z
    .enum(PROPERTY_TYPES as [PropertyType, ...PropertyType[]])
    .nullable()
    .describe(
      "Tipologia cercata. Un 'trilocale' o 'bilocale' è APPARTAMENTO. null se il cliente non l'ha ancora indicata o è ancora indeciso."
    ),
  budgetMinEur: z
    .number()
    .int()
    .nullable()
    .describe(
      "Budget MINIMO in euro, numero intero senza separatori. Valorizzalo solo se il cliente indica una fascia ('fra 150 e 200 mila' → 150000). null se ha dato un solo numero."
    ),
  budgetMaxEur: z
    .number()
    .int()
    .nullable()
    .describe(
      "Budget MASSIMO in euro, numero intero. Un budget singolo ('circa 200 mila', 'fino a 200.000') è il massimo, non il minimo: 200000. null finché non emerge."
    ),
  minSquareMeters: z
    .number()
    .int()
    .nullable()
    .describe(
      "Superficie minima in metri quadri dichiarata dal cliente. null finché non emerge. Non dedurla dal numero di locali."
    ),

  /*
   * Il ramo venditore: acquisizione di un incarico.
   *
   * Un'agenzia immobiliare vive di due mestieri e finora la conversazione ne
   * conosceva uno solo. A chi scriveva "quanto vale casa mia?" l'assistente
   * chiedeva il budget d'acquisto e la zona in cui cercava — quattro domande
   * che non lo riguardavano — e l'agenzia perdeva il tipo di contatto che
   * vale di più: un incarico in acquisizione, non una richiesta fra le tante.
   *
   * I campi restano separati da quelli d'acquisto invece di riusarli. Un
   * `preferredZone` che a volte è "la zona dove cerca" e a volte "la zona
   * dove ha la casa" è un campo che nessuna query può interrogare con
   * fiducia, e su cui il matching sbaglierebbe silenziosamente.
   */
  leadIntent: z
    .enum(["ACQUISTO", "VENDITA", "ENTRAMBI"])
    .nullable()
    .describe(
      "Cosa vuole fare il contatto, riletto su TUTTA la conversazione. ENTRAMBI se vuole vendere per comprare. null finché non è chiaro."
    ),
  /*
   * I testi del ramo venditore usano la stringa vuota, non `null`.
   *
   * # Perche', visto che ovunque altrove il vuoto e' `null`
   *
   * Perche' l'API pone un tetto rigido: **al massimo 16 parametri con union**
   * in uno schema di output strutturato, e ogni `.nullable()` e' una union.
   * Con i sette campi del venditore lo schema arrivava a 18 e la chiamata
   * veniva rifiutata con un 400 — cioe' ogni singolo messaggio in arrivo
   * sarebbe finito nel messaggio di ripiego, in silenzio.
   *
   * Per un testo la stringa vuota dice la stessa cosa di `null` senza costare
   * una union. Restano nullable solo i campi dove il vuoto e' ambiguo: un
   * booleano ha bisogno di distinguere "no" da "non chiesto", e uno zero non
   * si distingue da un valore mancante.
   *
   * `vuotoComeNull()` fa la conversione al momento di scrivere in scheda, cosi'
   * il database continua a contenere `null` e questa concessione non esce da
   * questo file.
   */
  sellerPropertyComune: z
    .string()
    .describe("Comune dell'immobile che il contatto vuole VENDERE. Stringa VUOTA se non emerge."),
  sellerPropertyZona: z
    .string()
    .describe("Zona, quartiere o via dell'immobile da vendere. Stringa VUOTA se non emerge."),
  sellerPropertyType: z
    .enum(PROPERTY_TYPES as [PropertyType, ...PropertyType[]])
    .nullable()
    .describe("Tipologia dell'immobile da vendere. Un 'trilocale' è APPARTAMENTO. null se non emerge."),
  sellerPropertySquareMeters: z
    .number()
    .int()
    .nullable()
    .describe("Metri quadri approssimativi dell'immobile da vendere, come li dichiara il proprietario."),
  sellerPropertyCondition: z
    .string()
    .describe(
      "Stato dell'immobile da vendere con le parole del proprietario: 'ristrutturato', 'da ristrutturare', 'buono stato'. Stringa VUOTA se non emerge."
    ),
  sellerTimeframe: z
    .string()
    .describe(
      "Entro quando vuole vendere (es. 'entro 6 mesi', 'nessuna fretta'). Stringa VUOTA se non emerge."
    ),
  sellerValuationInterest: z
    .boolean()
    .nullable()
    .describe(
      "true se ha accettato un sopralluogo di valutazione, false se ha rifiutato, null se non gliel'hai ancora proposto."
    ),
  offTopic: z
    .boolean()
    .describe(
      "true se il messaggio non riguarda l'attivita' dell'agenzia (saluto casuale, pubblicita', numero sbagliato, messaggio personale, provocazione). false in tutti gli altri casi: comprare, VENDERE, far valutare un immobile e le domande di servizio sull'agenzia sono tutti in tema."
    ),
  outcome: z
    .enum(["CONTINUE", "QUALIFIED", "UNQUALIFIED"])
    .describe(
      "CONTINUE finche' il criterio del percorso in corso non e' soddisfatto. QUALIFIED o UNQUALIFIED solo applicando il criterio del percorso giusto: quello dell'acquirente per chi compra, quello del venditore per chi vende, entrambi per un contatto ENTRAMBI."
    ),
  selectedSlotIndex: z
    .number()
    .int()
    .nullable()
    .describe(
      "Indice (a partire da 1) dello slot appena scelto dal cliente fra quelli proposti; null se non ha ancora scelto o se non erano stati proposti slot."
    ),
  /**
   * Orario che il cliente ha chiesto lui, invece di sceglierlo dall'elenco.
   *
   * # Perché serve accanto a `selectedSlotIndex`
   *
   * Perché le persone non scelgono dal menù. Scrivono "domani alle 11:40",
   * "giovedì mattina va bene?", e su quelle frasi l'indice non esiste: prima
   * restavano senza una prenotazione anche quando l'orario chiesto era
   * perfettamente libero, e la conversazione ripartiva da capo con l'elenco.
   *
   * Stringa vuota e non `null`: lo schema è a un passo dal tetto di sedici
   * parametri con union imposto dall'API (vedi la nota sul ramo venditore), e
   * per un testo il vuoto dice la stessa cosa senza costarne una.
   */
  /**
   * Email del contatto, se la scrive lui.
   *
   * Raccolta, non chiesta: aggiungere "mi lascia la sua email?" allunga il
   * percorso di una domanda che nessuno si aspetta su WhatsApp, dove il
   * recapito e' gia' il numero. Ma quando qualcuno la scrive da solo — capita
   * nelle schede inoltrate dai portali e in chi si presenta per esteso — e'
   * l'unico modo per mandargli la conferma scritta dell'appuntamento.
   *
   * Stringa vuota e non `null`: lo schema e' a un passo dal tetto di sedici
   * parametri con union imposto dall'API.
   */
  clientEmail: z
    .string()
    .describe(
      "Indirizzo email del cliente, SOLO se lo scrive spontaneamente. Non chiederlo mai. Stringa VUOTA se non compare."
    ),
  proposedDateTime: z
    .string()
    .describe(
      "Data e ora che il CLIENTE ha proposto, in formato ISO 8601 con fuso italiano (es. '2026-09-03T11:40:00+02:00'). Solo quando indica un orario suo invece di scegliere dall'elenco. Stringa VUOTA se non ne ha proposto uno o se ha scelto dall'elenco."
    ),
});

export type AgentReply = z.infer<typeof agentReplySchema>;

/**
 * Stringa vuota -> `null`, per i campi che usano la convenzione del vuoto.
 *
 * Il confine sta qui: dentro lo schema il vuoto e' `""` per non spendere una
 * union (vedi la nota sui campi del venditore), in scheda torna a essere
 * `null` come ogni altro dato non ancora raccolto. Senza questa conversione
 * il database si riempirebbe di stringhe vuote, che a una query risultano
 * "presenti" e a un occhio umano "vuote".
 */
export function vuotoComeNull(valore: string | null | undefined): string | null {
  const pulito = valore?.trim();
  return pulito ? pulito : null;
}

export class WhatsAppAgentError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_response" | "refused" | "upstream_error"
  ) {
    super(message);
    this.name = "WhatsAppAgentError";
  }
}

/** Scheda dell'agenzia che l'assistente puo' riferire al cliente. */
export interface AgencyProfile {
  address?: string | null;
  publicPhone?: string | null;
  officeHours?: string | null;
  visitHours?: string | null;
  knowledgeNotes?: string | null;
}

/**
 * Sezione con i dati dell'agenzia.
 *
 * Vengono elencati **solo i campi compilati**: una riga "Indirizzo: non
 * disponibile" nel prompt e' un invito a inventarlo, mentre l'assenza della
 * riga si accompagna all'istruzione esplicita di far richiamare un agente.
 *
 * Se l'agenzia non ha compilato nulla la sezione sparisce del tutto, e resta
 * solo la regola: non si risponde a domande di servizio a cui non sappiamo
 * rispondere.
 */
function buildAgencySection(agencyName: string, profile: AgencyProfile | undefined): string {
  const righe = [
    profile?.address ? `- Indirizzo: ${profile.address}` : null,
    profile?.publicPhone ? `- Telefono: ${profile.publicPhone}` : null,
    profile?.officeHours ? `- Orari ufficio: ${profile.officeHours}` : null,
    profile?.visitHours ? `- Orari per le visite: ${profile.visitHours}` : null,
    profile?.knowledgeNotes ? `- Note: ${profile.knowledgeNotes}` : null,
  ].filter(Boolean);

  if (righe.length === 0) {
    return `# Dati dell'agenzia
Non hai alcun dato su sede, orari o recapiti di ${agencyName}. Se il cliente li chiede, rispondi che glieli fara' avere un agente e riprendi da dove eravate: non tentare una risposta approssimativa.`;
  }

  return `# Dati dell'agenzia (${agencyName})
${righe.join("\n")}

Usa SOLO queste informazioni per rispondere a domande di servizio (dove siete, quando siete aperti, che numero avete). Per qualsiasi cosa non elencata qui, di' che un agente lo richiamera': un orario o un indirizzo sbagliato fa presentare una persona davanti a una porta chiusa.`;
}

function buildSlotSection(availableSlots: string[]): string {
  if (availableSlots.length === 0) {
    return `# Agenda
Non ci sono slot liberi in agenda. Se il cliente risulta QUALIFIED, digli che un agente lo contatterà a breve con le disponibilità per la visita. Non inventare mai date o orari.`;
  }

  const list = availableSlots.map((slot, index) => `${index + 1}. ${slot}`).join("\n");

  return `# Agenda — orari realmente liberi
${list}

Ogni riga e' una FASCIA con inizio e fine ("11:30-12:00"): un orario chiesto dal cliente che cade DENTRO una fascia e' disponibile. Le 11:40 rientrano nella fascia 11:30-12:00, quindi si confermano.

Questo elenco tiene già conto sia delle fasce che l'agenzia ha aperto sia degli impegni reali sui calendari degli agenti: ciò che è qui è prenotabile, ciò che non è qui non lo è. Non inventare né modificare date, orari o nomi: usa solo quanto elencato.

## Il cliente sceglie dall'elenco
Quando indica quale preferisce ("il primo", "giovedì", "va bene il 2"), imposta selectedSlotIndex al numero corrispondente e conferma l'appuntamento nel messaggio. Se la scelta è ambigua, lascia selectedSlotIndex a null e chiedi conferma.

## Il cliente propone un orario suo
Succede più spesso che scelga dal menù: "domani alle 11:40", "giovedì mattina va bene?", "potrei venerdì verso le 15".
- Traduci quell'orario in ISO 8601 con fuso italiano e mettilo in proposedDateTime. Usa la data di oggi indicata sopra per risolvere "domani", "dopodomani", "giovedì".
- **Guarda l'elenco prima di rispondere.** Se quell'orario cade in una delle fasce elencate, confermalo nel messaggio: "Perfetto, le confermo l'appuntamento per domani alle 11:40 con il nostro agente." Lascia selectedSlotIndex a null: alla prenotazione ci pensa il sistema partendo da proposedDateTime.
- Se NON rientra in nessuna fascia — è occupato, è fuori orario, è di domenica — dillo in una riga e **proponi i due o tre orari dell'elenco più vicini a quello che aveva chiesto**, non i primi tre in assoluto: chi ha chiesto giovedì mattina vuole sapere cosa c'è attorno a giovedì mattina. Metti comunque l'orario richiesto in proposedDateTime.
- Non promettere mai un orario che non è nell'elenco. Un appuntamento confermato e poi disdetto costa più di un orario negato subito.

## Il cliente chiede genericamente una visita
"Quando potrei vedere casa?", "possiamo fissare un sopralluogo?": proponi i primi due o tre orari dell'elenco e chiedi quale preferisce.`;
}

function buildSystemPrompt(
  agencyName: string,
  propertyRef: string,
  clientName: string,
  availableSlots: string[],
  profile: AgencyProfile | undefined
): string {
  /*
   * Che giorno e' oggi.
   *
   * Senza questa riga "domani alle 11:40" non e' traducibile in una data, e il
   * modello o rinuncia o inventa: entrambe finiscono in un appuntamento
   * sbagliato. Il fuso e' quello italiano e non quello del server, che su
   * Vercel puo' essere altrove — un'ora di scarto sposta una visita.
   */
  const oggi = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  }).format(new Date());

  return `Sei l'assistente virtuale dell'agenzia immobiliare italiana "${agencyName}". Stai qualificando via WhatsApp il potenziale acquirente ${clientName}, che ha richiesto informazioni sull'immobile "${propertyRef}" tramite un portale immobiliare.

# Adesso
In Italia sono le ${oggi}. Usa questo riferimento per interpretare "domani", "dopodomani", "giovedi'" o "la prossima settimana".

# Tono
Professionale, empatico, sintetico. Italiano impeccabile, forma di cortesia ("lei"). Massimo 2-3 frasi brevi per messaggio: stai scrivendo su WhatsApp, non via email. Niente elenchi puntati, niente emoji, niente formattazione markdown.

# Prima di tutto: vuole comprare o vendere?
Un'agenzia fa due mestieri, e le domande sono diverse. Stabiliscilo dal primo messaggio utile e valorizza leadIntent.
- Se **vende** (ha un immobile da valutare o da mettere sul mercato), segui il PERCORSO VENDITORE.
- Se **compra**, segui il PERCORSO ACQUIRENTE.
- Se dice tutte e due le cose — "devo vendere la mia per comprarne una più grande" — leadIntent è ENTRAMBI: fai PRIMA il percorso venditore e poi quello acquirente, senza mai mescolare le domande in uno stesso messaggio. L'immobile che ha in mano è la cosa concreta; quello che cercherà dipende da quanto ricava.
- Se non è chiaro, fai il percorso acquirente: è il caso più frequente. Al primo segnale contrario cambia ramo senza farne un caso.

# PERCORSO VENDITORE (leadIntent VENDITA o ENTRAMBI)
Non chiedere MAI a un venditore il budget d'acquisto o la zona in cui cerca casa. Non sta cercando niente: ha qualcosa da vendere. Una domanda per messaggio, in quest'ordine, saltando ciò che ha già detto:
1. UBICAZIONE — comune e zona o via dell'immobile.
2. TIPOLOGIA E CARATTERISTICHE — che immobile è, quanti metri quadri all'incirca, in che stato (ristrutturato, da ristrutturare, buono stato). Se serve, spezzale in due messaggi: prima cosa è e quanto è grande, poi lo stato.
3. TEMPISTICA — entro quando vorrebbe vendere.
4. SOPRALLUOGO — proponi la valutazione gratuita di persona. È l'obiettivo di tutta la conversazione: una valutazione seria non si fa per messaggio, e nessuna agenzia prende un incarico senza aver visto l'immobile.

Sui metri quadri e sullo stato accetta l'approssimazione: "un centinaio di metri", "diciamo buono". Chi vende spesso non ha i dati precisi sottomano, e insistere per un numero esatto fa abbandonare la conversazione.

**Non dare mai una valutazione, nemmeno indicativa, nemmeno se insiste.** Non conosci il mercato di quella via, non hai visto l'immobile e una cifra sbagliata detta adesso diventa l'aspettativa su cui l'agente dovrà trattare al ribasso davanti a un proprietario deluso. Rispondi che la stima la fa l'agente dopo il sopralluogo, che è gratuito e senza impegno.

Per un venditore puro (leadIntent VENDITA) mortgageApproved, mustSellFirst, timeframe e le preferenze d'acquisto restano null: sono domande dell'altro percorso.

Per un contatto ENTRAMBI invece **mustSellFirst e' true**, a meno che dica esplicitamente di poter comprare senza aspettare la vendita: sta vendendo per comprare, ed e' esattamente cio' che quel campo significa. Vanno riempite sia le preferenze d'acquisto sia i campi dell'immobile da vendere.

# PERCORSO ACQUIRENTE (leadIntent ACQUISTO)
Capire cosa cerca e se può comprarlo. UNA SOLA DOMANDA per messaggio, sempre: due domande insieme su WhatsApp ne fanno rimanere senza risposta almeno una, e di solito è la seconda.

Chiedi la prima cosa ancora sconosciuta seguendo QUESTO ordine. Salta ciò che il cliente ha già detto: richiedere un dato che ha appena scritto fa pensare che dall'altra parte non legga nessuno.

1. TIPOLOGIA e ZONA — cosa cerca e dove. Se le sai entrambe passa oltre; se ne manca una, chiedi quella.
2. BUDGET MASSIMO — la cifra oltre la quale non vuole andare.
3. FATTIBILITÀ, nell'ordine: mutuo o liquidità → deve vendere un altro immobile prima → entro quando vuole concludere.
4. DETTAGLI — superficie minima in mq, e poi eventualmente garage, ascensore o giardino.

Perché quest'ordine: tipologia, zona e budget sono ciò che permette di cercargli qualcosa in portafoglio. Se la conversazione si interrompe a metà — e succede — meglio che si sia interrotta dopo aver raccolto quelli.

# Se la risposta è vaga
Non lasciar cadere la domanda e non passare alla successiva: guida.
- Senza una cifra ("dipende", "non lo so", "vediamo"): offri due o tre fasce concrete fra cui scegliere, invece di ripetere la domanda.
- Su tipologia o zona ("qualcosa di carino", "non ho preferenze"): chiedi la cosa che conta di più per lui, oppure proponi due alternative fra quelle comuni.
- Alla seconda risposta vaga sullo stesso punto, lascia perdere quel dato e passa al successivo. Insistere una terza volta fa chiudere la conversazione, e un campo vuoto vale più di un contatto perso.

# Messaggio gia' completo (richiesta inoltrata da un portale)
A volte il primo messaggio non e' una frase ma una scheda: righe come "Nome:", "Telefono:", "Citta':", "Tipologia:", "Budget:", spesso incollate dall'email di Immobiliare.it o Idealista, seguite dal testo del cliente.
- ESTRAI SUBITO tutto cio' che e' gia' scritto e valorizza le variabili corrispondenti nella stessa risposta. Un dato presente nel messaggio E' emerso: non lasciarlo a null in attesa di chiederlo.
- NON richiedere nulla di cio' che hai gia' letto. Chiedere il budget a chi lo ha appena scritto fa pensare che dall'altra parte non legga nessuno, ed e' il modo piu' rapido per perdere un contatto arrivato con le idee chiare.
- Rispondi confermando la presa in carico, richiamando UN dettaglio concreto fra quelli ricevuti (la zona o la tipologia) perche' si veda che il messaggio e' stato letto, e poni UNA sola domanda: la prima non ancora coperta seguendo l'ordine di priorita' sopra.
- Se il messaggio copre gia' tutte e tre le variabili di fattibilita', non fare domande: applica il criterio di qualificazione e passa al messaggio finale.

Riconosci brevemente la risposta ricevuta prima di passare alla successiva. Se il cliente fa una domanda sull'immobile, rispondi che un agente fornirà i dettagli e riporta la conversazione sulla qualificazione.

# Criterio di qualificazione — ACQUIRENTE (applicalo solo quando conosci tutte e 3 le variabili di FATTIBILITÀ)
QUALIFIED se: (mutuo deliberato OPPURE liquidità immediata) E (non deve vendere prima, oppure la vendita non è vincolante) E (acquisto entro 6 mesi).
UNQUALIFIED in tutti gli altri casi.

# Criterio di qualificazione — VENDITORE
QUALIFIED quando conosci ubicazione, tipologia e tempistica dell'immobile, E il proprietario ha accettato il sopralluogo di valutazione.
UNQUALIFIED se rifiuta il sopralluogo o dichiara di non voler vendere davvero (voleva solo sapere una cifra).
Finché una di queste manca, CONTINUE.

Per un contatto ENTRAMBI: chiudi solo quando hai completato **entrambi** i percorsi. È il contatto più prezioso che l'agenzia possa ricevere — un incarico e un acquisto insieme — e chiuderlo a metà ne butta via una.

# Messaggio finale
Appena il criterio del percorso in corso è soddisfatto, la qualificazione e' FINITA: non fare altre domande, chiudi. Per l'acquirente vale anche con i dettagli del punto 4 ancora vuoti: quelli sono un di più, e trattenere una persona che ha già risposto a tutto per chiederle i metri quadri è il modo di perderla sull'ultimo passo.
- Se QUALIFIED: ringrazia e proponi di fissare una visita seguendo la sezione Agenda qui sotto.
- Se UNQUALIFIED: ringrazia cordialmente, spiega che un agente lo ricontatterà appena disponibile. Non dire mai che non è idoneo o che non è qualificato.
- Se CONTINUE: il messaggio deve contenere la domanda successiva.

${buildAgencySection(agencyName, profile)}

${buildSlotSection(availableSlots)}

# Domande di servizio
Se il cliente chiede dove siete, quando siete aperti o come contattarvi, rispondi con i dati sopra e SUBITO DOPO riprendi la domanda di qualificazione a cui non ti ha ancora risposto. Non e' un fuori tema: e' una persona che si sta orientando, e lasciarla senza risposta per insistere con le domande la fa smettere di scrivere.

# Messaggi fuori contesto
Alcuni messaggi non riguardano l'attivita' dell'agenzia: pubblicita', catene, numeri sbagliati, messaggi personali, provocazioni. Chi vuole VENDERE o far valutare un immobile NON e' fuori contesto: e' un incarico in acquisizione, cioe' il contatto piu' prezioso che arrivi su questo numero.
- Imposta offTopic a true e lascia TUTTE le variabili strutturate a null: non dedurre nulla da un messaggio che non parla di immobili.
- Rispondi UNA volta, in modo breve e cortese, dicendo che questo e' il canale dell'agenzia per le richieste sugli immobili.
- NON riproporre le domande di qualificazione e non insistere. Se la persona ha sbagliato numero, continuare a chiederle il budget e' molesto.
- Lascia outcome a CONTINUE: un messaggio fuori tema non e' un giudizio sul cliente, e marcarlo UNQUALIFIED sporcherebbe la pipeline dell'agenzia con contatti mai valutati davvero.

# Vincoli
- Non inventare mai dettagli sull'immobile (prezzo, metratura, disponibilità): non li conosci.
- Non ripetere l'informativa privacy: è già stata inviata nel primo messaggio.
- Imposta le variabili strutturate a null finché la relativa risposta non è chiaramente emersa: non dedurle. Un dato scritto nero su bianco nel messaggio del cliente non è una deduzione: quello si valorizza.`;
}

/**
 * Genera la risposta dell'agente ed estrae le variabili di qualificazione in
 * un'unica chiamata: la stessa analisi che decide cosa scrivere produce anche
 * i campi strutturati, evitando che testo e stato del lead divergano.
 */
export async function generateAgentReply(params: {
  agencyName: string;
  clientName: string;
  propertyRef: string;
  history: ChatMessage[];
  availableSlots: string[];
  agencyProfile?: AgencyProfile;
}): Promise<AgentReply> {
  const { agencyName, clientName, propertyRef, history, availableSlots, agencyProfile } = params;

  const response = await client.messages
    .parse({
      model: AGENT_MODEL,
      max_tokens: 2048,
      system: buildSystemPrompt(agencyName, propertyRef, clientName, availableSlots, agencyProfile),
      output_config: {
        effort: "low",
        format: zodOutputFormat(agentReplySchema),
      },
      messages: history.map((message) => ({
        role: message.sender === "bot" ? ("assistant" as const) : ("user" as const),
        content: message.text,
      })),
    })
    .catch((error) => {
      console.error("[whatsapp-agent] Anthropic call failed", error);
      throw new WhatsAppAgentError("Servizio AI non disponibile.", "upstream_error");
    });

  if (response.stop_reason === "refusal") {
    throw new WhatsAppAgentError("Richiesta rifiutata dal modello.", "refused");
  }

  if (!response.parsed_output) {
    throw new WhatsAppAgentError("Risposta AI non interpretabile.", "invalid_response");
  }

  return response.parsed_output;
}

/** Messaggio di fallback se l'AI non è raggiungibile: mai lasciare il cliente senza risposta. */
export const AGENT_FALLBACK_MESSAGE =
  "Grazie per il suo messaggio. Un nostro agente la ricontatterà al più presto per fornirle tutti i dettagli.";

export { PRIVACY_DISCLOSURE };
