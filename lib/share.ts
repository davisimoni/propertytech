/**
 * Condivisione rapida di un contenuto generato.
 *
 * Usa il deep link `wa.me` anziché la Cloud API: qui l'agente sta inoltrando
 * un contenuto a un destinatario che sceglie sul momento, dal proprio WhatsApp.
 * La Cloud API serve al caso opposto — messaggi automatici dell'agenzia verso
 * un contatto noto — e per i messaggi business-initiated richiede un template
 * approvato, quindi non è adatta a questo inoltro estemporaneo.
 */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Limite pratico del deep link: URL molto lunghi vengono troncati da alcuni client. */
export const SHARE_TEXT_SOFT_LIMIT = 1500;

export function truncateForShare(text: string): string {
  if (text.length <= SHARE_TEXT_SOFT_LIMIT) return text;
  return `${text.slice(0, SHARE_TEXT_SOFT_LIMIT - 1).trimEnd()}…`;
}
