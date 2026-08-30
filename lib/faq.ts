import { PLANS } from "@/lib/plans";

export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Fonte unica delle FAQ: alimenta sia l'accordion della landing sia i dati
 * strutturati `FAQPage` del JSON-LD.
 *
 * Tenerle in due posti diversi porterebbe rapidamente a divergere, e Google
 * penalizza i rich result il cui markup non corrisponde al testo visibile
 * in pagina.
 *
 * # Perché le prime tre sono operative e non commerciali
 *
 * Un titolare che valuta un assistente automatico sui propri clienti non si
 * chiede quanto costa: si chiede cosa succede quando la conversazione va in un
 * posto che l'automatismo non regge. Le tre domande in cima — vocali, subentro
 * manuale, lettura delle visure — sono quelle che decidono se il prodotto entra
 * in agenzia. Le altre restano sotto perché sono obiezioni vere ma successive.
 */
export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "L'AI risponde anche alle note vocali su WhatsApp?",
    answer:
      "Sì. Il vocale viene trascritto e l'assistente ne capisce il contenuto come se fosse un messaggio scritto: se il contatto racconta a voce che cerca un trilocale con box e ha già il mutuo deliberato, quei dati finiscono nella scheda del lead. L'audio non viene conservato: passa dalle API di trascrizione di OpenAI, negli Stati Uniti (EU-U.S. Data Privacy Framework e clausole contrattuali standard), non viene usato per addestrare modelli e si cancella subito dopo, restando il solo testo. Se un vocale è troppo lungo o incomprensibile, l'assistente chiede cortesemente di riscriverlo invece di tirare a indovinare.",
  },
  {
    question: "Posso intervenire se voglio rispondere io al cliente?",
    answer:
      "Sì, in qualsiasi momento e con un clic. Dalla scheda del contatto sposti l'interruttore e l'assistente si ferma su quella conversazione: da lì in poi scrivi tu e lui non manda più nulla. Puoi farlo anche dal telefono, scrivendo !pausa direttamente nella chat WhatsApp mentre sei fuori; !riprendi lo riattiva quando hai finito. La cronologia resta tutta in un posto solo, che tu abbia risposto a mano o no.",
  },
  {
    question: "Come funziona l'estrazione dei dati dalle visure?",
    answer:
      "Carichi il PDF della visura catastale — o della planimetria, dell'atto di provenienza, dell'APE — e in pochi secondi ottieni Foglio, Particella, Subalterno, Rendita Catastale, categoria, quote di proprietà e Intestatari già compilati nella scheda dell'immobile, con una sintesi di cosa manca o non torna. Da lì esporti la scheda in PDF con il tuo logo. Niente più dati ricopiati a mano e niente errori di battitura in un preliminare.",
  },
  {
    question: "Devo avere competenze tecniche o un programmatore per usare PropertyTech?",
    answer:
      "No, nessuna competenza tecnica. Ti guidiamo passo passo e in 2 minuti sei operativo. Se sai usare WhatsApp sai usare PropertyTech: funziona dal computer dell'ufficio e dal telefono mentre sei in giro per visite.",
  },
  {
    question:
      "L'AI su WhatsApp rischia di dare informazioni sbagliate o inventare prezzi agli acquirenti?",
    answer:
      "No. L'assistente parla solo sulla base delle schede immobile e delle disponibilità che inserisci tu. Ha il divieto esplicito di inventare cifre, date o dati catastali: se non conosce un'informazione dice che sarà un agente a fornirla.",
  },
  {
    question: "Cosa succede quando finiscono i crediti gratuiti della prova?",
    answer: `Non succede nulla di automatico: nessun addebito e nessun costo nascosto. Finiti i ${PLANS.trial.waConversationsLimit} crediti decidi con calma se passare a ${PLANS.starter.name}, ${PLANS.pro.name} o ${PLANS.enterprise.name}. Se non fai nulla, l'account resta semplicemente fermo.`,
  },
  {
    question: "I dati dei miei immobili e dei miei clienti sono al sicuro?",
    answer:
      "Sì. Database e server principali sono in Unione Europea (Francoforte) e il trattamento è conforme al GDPR. I dati dei tuoi clienti restano di tua proprietà e non vengono usati per addestrare modelli di intelligenza artificiale. Un'eccezione dichiarata: la trascrizione delle note vocali passa dalle API di OpenAI, negli Stati Uniti, sotto EU-U.S. Data Privacy Framework e clausole contrattuali standard — l'audio non viene conservato né da noi né dal fornitore per l'addestramento, e si cancella subito dopo la trascrizione. L'elenco completo dei fornitori è nell'informativa privacy.",
  },
  {
    question: "Posso disdire quando voglio?",
    answer:
      "Sì. Nessun vincolo annuale e nessuna penale: cambi piano o disdici da solo dalle impostazioni, in qualsiasi momento e con un clic.",
  },
];
