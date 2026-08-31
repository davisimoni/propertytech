import "server-only";

/**
 * Ripulitura del testo in arrivo da WhatsApp.
 *
 * # Da dove arrivano i caratteri invisibili
 *
 * Un messaggio scritto a mano sul telefono non ne contiene quasi mai. Li
 * portano i messaggi **incollati**: la richiesta copiata dall'email di
 * Immobiliare.it o di Idealista, il testo passato da un gestionale, la scheda
 * ricopiata da un PDF. Insieme al testo viaggiano spazi a larghezza zero,
 * marcatori di direzione e BOM, tutti invisibili a chi legge.
 *
 * # Perché toglierli, visto che il modello li tollera
 *
 * Non è il modello il problema: è tutto ciò che confronta stringhe. `trim()`
 * non rimuove U+200B, che per Unicode non è uno spazio, quindi un messaggio
 * fatto di soli caratteri invisibili risulta "non vuoto" e apre una scheda
 * senza contenuto. Un `!pausa` con un carattere invisibile in mezzo non viene
 * riconosciuto come comando e finisce al cliente. `STOP` con un BOM davanti non
 * è più l'opt-out che il GDPR vuole immediatamente efficace.
 *
 * Sono guasti silenziosi: nessuno lancia, nessuno logga, e il messaggio
 * semplicemente non fa quello che doveva.
 *
 * # Cosa NON fa
 *
 * Non tocca gli a capo, che in un messaggio strutturato sono la struttura, né
 * accorcia il testo: un messaggio lungo è un messaggio ricco, non un errore.
 * Normalizza solo ciò che è invisibile o equivalente a uno spazio.
 *
 * Le classi sono scritte con escape espliciti e mai con il carattere letterale:
 * un invisibile dentro il sorgente è illeggibile in revisione e sopravvive male
 * a un cambio di codifica, che è esattamente il guasto che questo modulo evita.
 */

/**
 * Caratteri invisibili rimossi.
 *
 * - `U+00AD` trattino morbido, usato da alcuni gestionali per la sillabazione;
 * - `U+200B–U+200D` spazio a larghezza zero, non-giuntore, giuntore;
 * - `U+200E`/`U+200F` e `U+202A–U+202E` marcatori di direzione del testo;
 * - `U+2060` giuntore di parole;
 * - `U+FEFF` BOM, in testa a ciò che proviene da un file di testo.
 */
const INVISIBILI = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;

/** Spazi "esotici" resi in spazio normale, così i confronti tornano. */
const SPAZI_ESOTICI = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

/** Tre o più righe vuote di fila: una separazione basta a leggere. */
const RIGHE_VUOTE = /\n{3,}/g;

/**
 * Ripulisce il testo di un messaggio in arrivo.
 *
 * Idempotente: applicarla due volte dà lo stesso risultato, così può stare sia
 * al confine sia in un punto interno senza che l'ordine conti.
 */
export function sanitizeInboundText(raw: string): string {
  return raw
    .replace(INVISIBILI, "")
    .replace(SPAZI_ESOTICI, " ")
    // I ritorni a capo di Windows arrivano dai testi incollati dal computer.
    .replace(/\r\n?/g, "\n")
    .replace(RIGHE_VUOTE, "\n\n")
    // Spazi in coda di riga: invisibili, ma spostano un confronto esatto.
    .replace(/[ \t]+$/gm, "")
    .trim();
}

/**
 * Quanti caratteri invisibili conteneva il messaggio.
 *
 * Serve ai log: sapere che un messaggio ne portava trenta dice subito che
 * veniva da un copia-incolla, e distingue un problema di provenienza da un
 * problema di contenuto quando si indaga su un lead che non è comparso.
 */
export function countInvisibleChars(raw: string): number {
  return (raw.match(INVISIBILI) ?? []).length;
}
