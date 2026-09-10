/**
 * Condivisione rapida di un contenuto generato.
 *
 * Usa il deep link `wa.me` anziché la Cloud API: qui l'agente sta inoltrando
 * un contenuto a un destinatario che sceglie sul momento, dal proprio WhatsApp.
 * La Cloud API serve al caso opposto — messaggi automatici dell'agenzia verso
 * un contatto noto — e per i messaggi business-initiated richiede un template
 * approvato, quindi non è adatta a questo inoltro estemporaneo.
 */
export function whatsappShareUrl(text: string, phone?: string | null): string {
  const destinatario = normalizePhoneForWaMe(phone);
  return `https://wa.me/${destinatario}?text=${encodeURIComponent(text)}`;
}

/**
 * Riduce un numero alla forma che `wa.me` accetta: sole cifre, con prefisso
 * internazionale e senza `+`.
 *
 * Gli agenti scrivono i numeri come capita — "+39 333 123 4567",
 * "333.123.4567", "0039..." — e `wa.me` con qualunque separatore apre una
 * schermata di errore invece della chat. Un numero italiano scritto senza
 * prefisso (dieci cifre che iniziano per 3) prende il 39: senza, il deep link
 * lo interpreterebbe come statunitense e aprirebbe una conversazione con un
 * numero che non esiste.
 *
 * Stringa vuota quando non c'è un numero utilizzabile: `wa.me/?text=…` è il
 * comportamento storico, e apre WhatsApp facendo scegliere il destinatario.
 */
export function normalizePhoneForWaMe(phone?: string | null): string {
  if (!phone) return "";

  let cifre = phone.replace(/\D/g, "");
  if (!cifre) return "";

  // "0039..." e "00 39..." sono la forma internazionale con lo zero doppio.
  if (cifre.startsWith("00")) cifre = cifre.slice(2);

  // Cellulare italiano senza prefisso: 3XX seguito da 6-7 cifre.
  if (/^3\d{8,9}$/.test(cifre)) cifre = `39${cifre}`;

  // Sotto le otto cifre non è un recapito: meglio far scegliere il contatto
  // che aprire una chat con un numero inventato.
  return cifre.length >= 8 ? cifre : "";
}

/** Limite pratico del deep link: URL molto lunghi vengono troncati da alcuni client. */
export const SHARE_TEXT_SOFT_LIMIT = 1500;

export function truncateForShare(text: string): string {
  if (text.length <= SHARE_TEXT_SOFT_LIMIT) return text;
  return `${text.slice(0, SHARE_TEXT_SOFT_LIMIT - 1).trimEnd()}…`;
}
