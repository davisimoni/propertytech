/**
 * Scelta dell'indirizzo WhatsApp a cui inviare.
 *
 * Sta in un modulo a parte, senza dipendenze, perche' e' l'unico punto del
 * servizio in cui un errore non fa fallire nulla: Baileys accetta qualunque
 * JID sintatticamente valido, risponde che ha inviato, e un indirizzo
 * inesistente non recapita in silenzio. Isolarlo qui lo rende collaudabile
 * senza avviare il socket.
 *
 * # Il problema
 *
 * WhatsApp non identifica piu' tutti i contatti col numero di telefono: per
 * molte chat consegna un LID (`<id>@lid`), un identificativo opaco lungo
 * 15-17 cifre che NON e' un recapito. Ricostruire l'indirizzo come
 * `<cifre>@s.whatsapp.net` a partire da un LID produce un destinatario che
 * non esiste.
 */

/**
 * Ultima lunghezza che, in assenza di un JID, conviene ancora trattare come
 * numero di telefono.
 *
 * E.164 ammette fino a 15 cifre, ma nessun operatore assegna numeri cosi'
 * lunghi: in pratica si arriva a 13-14 col prefisso internazionale. I LID
 * invece partono da 15. La soglia sta quindi a 14, dove la probabilita' si
 * ribalta.
 *
 * Il compromesso e' voluto e asimmetrico: rifiutare un numero legittimo
 * lunghissimo produce un errore visibile nei log, che si corregge; accettare
 * un LID travestito da numero produce un messaggio che il sistema dichiara
 * inviato e che non arriva a nessuno. Il secondo errore e' quello che abbiamo
 * gia' pagato.
 *
 * Vale solo come rete di sicurezza: per le chat aperte da WhatsApp la
 * piattaforma manda sempre il JID, e questa ricostruzione non viene nemmeno
 * raggiunta.
 */
export const MAX_PHONE_DIGITS = 14;

/**
 * @param {{ to?: string, jid?: string }} input
 * @returns {{ ok: true, jid: string } | { ok: false, reason: string }}
 */
export function resolveSendJid(input) {
  const provided = typeof input.jid === "string" ? input.jid.trim() : "";

  // L'indirizzo ricevuto col messaggio in arrivo ha sempre la precedenza: e'
  // quello esatto della conversazione, e vale sia per i numeri sia per i LID.
  if (provided) {
    if (!provided.includes("@")) return { ok: false, reason: "jid_without_domain" };
    return { ok: true, jid: provided };
  }

  const digits = String(input.to ?? "").replace(/\D/g, "");
  if (!digits) return { ok: false, reason: "empty_recipient" };

  // Ricostruzione dalle cifre: legittima solo per i lead dei portali, dove il
  // numero e' un numero vero.
  if (digits.length > MAX_PHONE_DIGITS) {
    return { ok: false, reason: "recipient_too_long_for_phone" };
  }

  return { ok: true, jid: `${digits}@s.whatsapp.net` };
}

/**
 * Estrae dal messaggio in arrivo l'indirizzo della chat e, quando la libreria
 * lo espone, il numero di telefono vero che sta dietro a un LID.
 *
 * @param {{ key?: { remoteJid?: string, senderPn?: string, participantPn?: string } }} msg
 */
export function describeSender(msg) {
  const jid = msg?.key?.remoteJid ?? "";
  const senderPn = msg?.key?.senderPn || msg?.key?.participantPn || null;
  const phoneFromPn = senderPn ? String(senderPn).split("@")[0] : null;

  return {
    jid,
    isLid: jid.endsWith("@lid"),
    // `from` resta il campo storico del contratto. Con un LID e senza
    // `senderPn` non abbiamo un numero: si manda l'identificativo, perche' e'
    // cio' che tiene insieme la conversazione, ma e' il JID che conta per
    // rispondere.
    from: phoneFromPn || jid.split("@")[0],
  };
}
