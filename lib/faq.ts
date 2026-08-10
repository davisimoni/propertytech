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
 */
export const FAQ_ITEMS: FaqItem[] = [
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
    question: "Come funziona l'estrazione dei dati da visure e atti catastali?",
    answer:
      "Carichi il PDF e in pochi secondi ottieni proprietari, quote, categoria, rendita ed eventuali difformità, con una sintesi che ti dice subito cosa verificare. Niente più dati ricopiati a mano e niente errori di battitura in un preliminare.",
  },
  {
    question: "Cosa succede quando finiscono i crediti gratuiti della prova?",
    answer: `Non succede nulla di automatico: nessun addebito e nessun costo nascosto. Finiti i ${PLANS.trial.waConversationsLimit} crediti decidi con calma se passare a ${PLANS.starter.name}, ${PLANS.pro.name} o ${PLANS.enterprise.name}. Se non fai nulla, l'account resta semplicemente fermo.`,
  },
  {
    question: "I dati dei miei immobili e dei miei clienti sono al sicuro?",
    answer:
      "Sì. I server sono in Unione Europea (Francoforte) e il trattamento è conforme al GDPR. I dati dei tuoi clienti restano di tua proprietà, non li usiamo per addestrare modelli di intelligenza artificiale e le registrazioni vocali vengono cancellate subito dopo la trascrizione.",
  },
  {
    question: "Posso disdire quando voglio?",
    answer:
      "Sì. Nessun vincolo annuale e nessuna penale: cambi piano o disdici da solo dalle impostazioni, in qualsiasi momento e con un clic.",
  },
];
