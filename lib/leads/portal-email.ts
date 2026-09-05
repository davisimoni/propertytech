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
  nome: ["nome e cognome", "nome completo", "nominativo", "nome", "utente", "richiedente"],
  telefono: ["telefono", "cellulare", "cell", "tel", "recapito telefonico", "numero di telefono", "phone"],
  email: ["email", "e-mail", "indirizzo email", "mail"],
  riferimento: ["riferimento", "rif", "codice immobile", "codice annuncio", "annuncio", "immobile", "id annuncio"],
  messaggio: ["messaggio", "richiesta", "note", "testo", "commento"],
} as const;

/**
 * Valore di una riga "Etichetta: valore".
 *
 * Cerca la riga per intero e non la sottostringa: senza l'ancoraggio,
 * "telefono" troverebbe anche "telefono dell'agenzia" in fondo all'email, e
 * l'agenzia si ritroverebbe a scriversi da sola.
 */
function valoreEtichetta(righe: string[], etichette: readonly string[]): string | null {
  for (const riga of righe) {
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
  }
  return null;
}

/**
 * Primo numero di telefono italiano plausibile nel testo.
 *
 * Ripiego per quando l'email non ha una riga "Telefono:" — succede con i
 * moduli del sito dell'agenzia, che scrivono tutto di seguito.
 *
 * Vincoli stretti di proposito: 9-11 cifre dopo l'eventuale prefisso. Senza,
 * un codice annuncio o una partita IVA verrebbero presi per un numero, e il
 * primo messaggio partirebbe verso il nulla a nome dell'agenzia.
 */
export function trovaTelefono(testo: string): string | null {
  const candidati = testo.match(/(?:\+39[\s.-]?|0039[\s.-]?)?(?:3\d{2}|0\d{1,3})[\s.-]?\d{3}[\s.-]?\d{3,4}/g);
  if (!candidati) return null;

  for (const grezzo of candidati) {
    const cifre = grezzo.replace(/\D/g, "").replace(/^0039/, "").replace(/^39(?=\d{9,})/, "");
    if (cifre.length >= 9 && cifre.length <= 11) return cifre;
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
  const clientPhone = trovaTelefono(telefono) ?? trovaTelefono(corpo);
  if (!clientPhone) return null;

  const nomeGrezzo = valoreEtichetta(righe, ETICHETTE.nome);
  // Un "Nome:" che contiene una chiocciola e' l'email finita nella riga
  // sbagliata, non un nome: succede sui moduli compilati male.
  const clientName =
    nomeGrezzo && !nomeGrezzo.includes("@") ? nomeGrezzo.slice(0, 120) : "Richiesta dal portale";

  const emailRiga = valoreEtichetta(righe, ETICHETTE.email);
  const clientEmail = (emailRiga && trovaEmail(emailRiga)) ?? trovaEmail(corpo);

  const riferimento = valoreEtichetta(righe, ETICHETTE.riferimento);
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
