import type { PortalSource } from "@prisma/client";

/**
 * Estrazione di una richiesta dai messaggi che i portali mandano per email.
 *
 * # Perché a regole e non con un modello
 *
 * Perché queste email hanno una forma fissa — righe "Nome:", "Telefono:" —
 * e su una forma fissa una regola non sbaglia mai, mentre un modello sbaglia
 * di rado ma sbaglia. Qui l'errore non è un testo brutto: è un numero di
 * telefono storto, cioè un messaggio WhatsApp mandato a uno sconosciuto a
 * nome dell'agenzia. In più costa zero e risponde in un millisecondo, mentre
 * l'ingaggio ha già i suoi secondi da spendere altrove.
 *
 * Se una email non rientra in nessuno schema, questa funzione torna `null` e
 * il lead non nasce: meglio una richiesta che l'agente trova nella propria
 * casella che una scheda con il nome sbagliato in pipeline.
 */

export interface ParsedPortalLead {
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  propertyRef: string | null;
  portalSource: PortalSource;
  message: string | null;
}

/**
 * Da quale portale arriva, dedotto da mittente e testo.
 *
 * L'inoltro fa perdere il mittente originale — chi inoltra diventa lui il
 * mittente — quindi il testo conta quanto l'indirizzo, e spesso di più.
 */
export function detectPortal(from: string, corpo: string): PortalSource {
  const tutto = `${from} ${corpo}`.toLowerCase();

  /*
   * Confine di dominio, non sottostringa.
   *
   * `rossiimmobiliare.it` CONTIENE `immobiliare.it`: con un `includes` ogni
   * agenzia che ha "immobiliare" nel proprio dominio — cioe' moltissime —
   * vedeva le proprie richieste attribuite a Immobiliare.it, falsando la
   * sola statistica che dice se un portale sta rendendo.
   *
   * Il confine e' l'inizio stringa o un carattere che non puo' far parte di
   * un dominio: spazio, @, /, punto.
   */
  const nominato = (dominio: string) => {
    let da = tutto.indexOf(dominio);
    while (da !== -1) {
      const precedente = da === 0 ? "" : tutto[da - 1]!;
      // Confine vero: prima del dominio non ci puo' essere un
      // carattere che ne farebbe parte (lettera, cifra, punto, trattino).
      if (!/[a-z0-9.-]/.test(precedente)) return true;
      da = tutto.indexOf(dominio, da + 1);
    }
    return false;
  };

  // Casa.it e Idealista prima: il loro nome non e' contenuto in quello di
  // Immobiliare.it, mentre il contrario puo' capitare in un testo inoltrato.
  if (nominato("casa.it")) return "CASA_IT";
  if (nominato("idealista.it") || nominato("idealista.com")) return "IDEALISTA";
  if (nominato("immobiliare.it")) return "IMMOBILIARE_IT";
  return "SITO_WEB";
}

/**
 * Etichette con cui i portali italiani nominano lo stesso campo.
 *
 * Sono elenchi e non una sola parola perché la stessa cosa cambia nome da un
 * portale all'altro e da un aggiornamento al successivo: "Telefono", "Cell.",
 * "Recapito telefonico" sono la stessa riga.
 */
const ETICHETTE = {
  /*
   * "da" NON e' qui, ed e' un errore che avevo fatto.
   *
   * Su un'email inoltrata la prima riga e' "Da: notifiche@casa.it", che con
   * quell'etichetta in elenco vinceva sul vero "Nome e cognome" piu' sotto:
   * ogni richiesta inoltrata a mano — cioe' la maggioranza — perdeva il nome
   * del cliente e finiva in pipeline come "Richiesta dal portale".
   */
  nome: [
    "nome e cognome",
    "nome completo",
    "nominativo",
    "nome",
    "utente",
    "richiedente",
    // Idealista scrive "Nome cliente:", e il confronto e' sulla chiave
    // INTERA: senza queste varianti il nome andava perso e il contatto
    // finiva in pipeline come "Richiesta dal portale".
    "nome cliente",
    "nome del cliente",
    "cliente",
    "contatto",
  ],
  telefono: ["telefono", "cellulare", "cell", "tel", "recapito telefonico", "numero di telefono", "phone"],
  email: ["email", "e-mail", "indirizzo email", "mail"],
  riferimento: ["riferimento", "rif", "codice immobile", "codice annuncio", "annuncio", "immobile", "id annuncio"],
  messaggio: [
    "messaggio",
    "richiesta",
    "note",
    "testo",
    "commento",
    "messaggio del cliente",
    "richiesta del cliente",
    "testo del messaggio",
  ],
} as const;

/**
 * Valore di una riga "Etichetta: valore".
 *
 * Cerca la riga per intero e non la sottostringa: senza l'ancoraggio,
 * "telefono" troverebbe anche "telefono dell'agenzia" in fondo all'email, e
 * l'agenzia si ritroverebbe a scriversi da sola.
 */
function valoreEtichetta(righe: string[], etichette: readonly string[]): string | null {
  for (let i = 0; i < righe.length; i++) {
    const riga = righe[i]!;
    const separatore = riga.indexOf(":");
    if (separatore === -1) continue;

    const chiave = riga
      .slice(0, separatore)
      .trim()
      .toLowerCase()
      .replace(/[*_>\-\s]+$/g, "")
      .replace(/^[*_>\-\s]+/g, "");

    if (!etichette.includes(chiave)) continue;

    const valore = riga.slice(separatore + 1).trim();
    if (valore) return valore;

    /*
     * Etichetta sola, valore sulla riga dopo.
     *
     * Immobiliare.it scrive "Messaggio del cliente:" e va a capo. Leggendo
     * solo la stessa riga, il messaggio del cliente andava perso per intero.
     *
     * La riga successiva si prende solo se non e' a sua volta un'etichetta:
     * altrimenti un campo vuoto si mangerebbe il valore del campo seguente,
     * che e' un errore peggiore di un campo mancante.
     */
    const successiva = righe[i + 1];
    if (successiva && !/^[^:]{1,30}:/.test(successiva)) return successiva;
  }
  return null;
}

/**
 * Riferimento dell'annuncio scritto in linea, non come riga etichettata.
 *
 * I portali lo mettono nell'oggetto o fra parentesi nel testo — "(Rif. V-340)",
 * "Rif. Asta 2026-992" — dove non esiste nessuna coppia `Etichetta: valore` da
 * cui pescarlo. Senza questo, il riferimento si perdeva su due portali su tre,
 * e l'agente riceveva una scheda senza sapere di quale immobile parli.
 */
export function trovaRiferimento(testo: string): string | null {
  const trovato = testo.match(/\brif\.?\s*(?:immobile|annuncio)?\s*:?\s*([^)\n,;]{1,40})/i);
  const valore = trovato?.[1]?.trim().replace(/[.\s]+$/, "");
  return valore || null;
}

/**
 * Etichette che NON introducono mai un recapito, per quanto il numero che le
 * segue somigli a un telefono.
 *
 * Una partita IVA italiana e' di undici cifre e comincia spesso per zero:
 * ha esattamente la forma di un numero fisso. Nel piede di ogni email di
 * agenzia ce n'e' una, e senza questo filtro diventava il "telefono" del
 * cliente ogni volta che l'email non aveva una riga "Telefono:" — con un
 * messaggio WhatsApp spedito nel nulla e un credito consumato.
 */
const ETICHETTE_VIETATE = [
  "p.iva",
  "piva",
  "partita iva",
  "vat",
  "c.f.",
  "cf",
  "codice fiscale",
  "rif",
  "rif.",
  "riferimento",
  "pratica",
  "protocollo",
  "codice",
  "annuncio",
  "fax",
  "iban",
  "tel. fisso",
  "telefono fisso",
  "fisso",
];

/** Quanti caratteri prima del numero si guardano per capire cosa lo introduce. */
const FINESTRA_CONTESTO = 30;

function introdottoDaEtichettaVietata(testo: string, posizione: number): boolean {
  const prima = testo.slice(Math.max(0, posizione - FINESTRA_CONTESTO), posizione).toLowerCase();
  return ETICHETTE_VIETATE.some((etichetta) => prima.includes(etichetta));
}

/**
 * Normalizza un candidato in sole cifre, sciogliendo i prefissi internazionali.
 * Torna `null` se non resta un numero di lunghezza plausibile.
 */
function soloCifre(grezzo: string): string | null {
  const cifre = grezzo.replace(/\D/g, "").replace(/^0039/, "39");
  if (cifre.length < 9 || cifre.length > 15) return null;
  return cifre;
}

/** Un numero italiano da cui si puo' sperare una risposta su WhatsApp. */
function eCellulareItaliano(cifre: string): boolean {
  const senzaPrefisso = cifre.replace(/^39/, "");
  return /^3\d{8,9}$/.test(senzaPrefisso);
}

export type OrigineTelefono = "etichetta" | "testo";

/**
 * Primo numero di telefono plausibile nel testo.
 *
 * # I due regimi, e perche' sono diversi
 *
 * Da una riga `Telefono:` il portale ha gia' dichiarato che quello e' il
 * recapito: si accetta anche un fisso, perche' rifiutarlo butterebbe via un
 * contatto vero per una preferenza nostra.
 *
 * Pescato dal testo libero, invece, non lo ha dichiarato nessuno: li' si
 * pretende un cellulare italiano oppure un numero internazionale esplicito
 * (con `+` o `00`), perche' e' l'unico modo di distinguere un recapito da una
 * qualunque sequenza di cifre presente nell'email.
 *
 * I separatori sono liberi: punti, spazi e trattini in qualsiasi
 * combinazione — `347.123.45.67` e `347 123 4567` sono lo stesso numero, e
 * prima il secondo passava e il primo no.
 */
export function trovaTelefono(
  testo: string,
  origine: OrigineTelefono = "testo"
): string | null {
  /*
   * Sequenze di cifre con separatori liberi, invece di uno schema fisso di
   * gruppi. Lo schema precedente pretendeva gruppi finali da 3-4 cifre e
   * scartava i cellulari scritti a coppie, che sono comunissimi.
   */
  const candidati = testo.matchAll(/(\+|00)?\d[\d\s.\-/]{7,20}\d/g);

  for (const candidato of candidati) {
    const grezzo = candidato[0];
    const posizione = candidato.index ?? 0;

    if (introdottoDaEtichettaVietata(testo, posizione)) continue;

    const cifre = soloCifre(grezzo);
    if (!cifre) continue;

    if (origine === "etichetta") return cifre;

    // Testo libero: solo cellulari italiani o numeri internazionali dichiarati.
    const internazionaleEsplicito = /^(\+|00)/.test(grezzo.trim());
    if (eCellulareItaliano(cifre) || (internazionaleEsplicito && cifre.length >= 10)) {
      return cifre;
    }
  }

  return null;
}

/** Prima email nel testo che non sia di un portale o della piattaforma. */
export function trovaEmail(testo: string): string | null {
  const trovate = testo.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g);
  if (!trovate) return null;

  const escluse = ["immobiliare.it", "idealista", "casa.it", "propertytechsolutions", "noreply", "no-reply"];
  for (const grezzo of trovate) {
    // "la mia mail e' giulia@example.com." porta dentro il punto della frase:
    // un indirizzo con il punto finale non riceve.
    const indirizzo = grezzo.replace(/[.,;:]+$/, "");
    const basso = indirizzo.toLowerCase();
    if (!escluse.some((e) => basso.includes(e))) return indirizzo;
  }
  return null;
}

/**
 * Ricava la richiesta dal testo dell'email, o `null` se non è riconoscibile.
 *
 * # Perché il telefono è obbligatorio e il nome no
 *
 * Perché senza numero non c'è niente da fare: tutto il modulo esiste per
 * scrivere su WhatsApp, e una scheda senza recapito è una riga che nessuno
 * lavorerà. Il nome invece si può non sapere — "Buongiorno" funziona lo
 * stesso — e rifiutare la richiesta per quello significherebbe buttare via un
 * contatto vero.
 */
export function parsePortalEmail(params: {
  from: string;
  subject: string;
  text: string;
}): ParsedPortalLead | null {
  const corpo = `${params.subject}\n${params.text}`;
  const righe = corpo.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);

  const telefono = valoreEtichetta(righe, ETICHETTE.telefono) ?? "";
  // Prima la riga dichiarata dal portale, poi il testo libero con le regole
  // strette: vedi i due regimi in `trovaTelefono`.
  const clientPhone =
    (telefono ? trovaTelefono(telefono, "etichetta") : null) ?? trovaTelefono(corpo, "testo");
  if (!clientPhone) return null;

  const nomeGrezzo = valoreEtichetta(righe, ETICHETTE.nome);
  // Un "Nome:" che contiene una chiocciola e' l'email finita nella riga
  // sbagliata, non un nome: succede sui moduli compilati male.
  const clientName =
    nomeGrezzo && !nomeGrezzo.includes("@") ? nomeGrezzo.slice(0, 120) : "Richiesta dal portale";

  const emailRiga = valoreEtichetta(righe, ETICHETTE.email);
  const clientEmail = (emailRiga && trovaEmail(emailRiga)) ?? trovaEmail(corpo);

  // Prima la riga etichettata, poi il "Rif. X" scritto in linea nell'oggetto
  // o fra parentesi: il primo e' piu' affidabile, il secondo copre i portali
  // che una riga dedicata non ce l'hanno.
  const riferimento = valoreEtichetta(righe, ETICHETTE.riferimento) ?? trovaRiferimento(corpo);
  const messaggio = valoreEtichetta(righe, ETICHETTE.messaggio);

  return {
    clientName,
    clientPhone,
    clientEmail,
    propertyRef: riferimento ? riferimento.slice(0, 200) : null,
    portalSource: detectPortal(params.from, corpo),
    message: messaggio ? messaggio.slice(0, 2000) : null,
  };
}

/**
 * L'agenzia a cui è indirizzata la richiesta, ricavata dal destinatario.
 *
 * L'indirizzo ha forma `lead-<organizationId>@dominio`. Torna `null` su
 * qualunque altra forma: un destinatario che non riconosciamo non deve mai
 * finire per approssimazione nella pipeline di un'agenzia qualsiasi.
 */
export function organizationIdFromAddress(to: string): string | null {
  const indirizzo = to.toLowerCase().match(/lead-([a-z0-9]+)@/);
  return indirizzo?.[1] ?? null;
}
