/**
 * Testi delle notifiche push.
 *
 * Brevi, perché lo schermo di blocco ne mostra una o due righe; senza emoji;
 * con il lessico del settore. Il dettaglio sta nell'email o nell'app: la
 * notifica dice cosa è successo e dove andare.
 *
 * Il contenuto è cifrato per il solo dispositivo (RFC 8291), ma compare sullo
 * schermo di blocco: per questo non contiene telefoni né importi, al più il
 * nome del cliente, che l'agente deve riconoscere a colpo d'occhio.
 *
 * `url` è sempre un percorso interno: il service worker rifiuta indirizzi
 * esterni, così una notifica non può diventare un link verso un altro sito.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Percorso interno da aprire al clic. */
  url: string;
  /**
   * Notifiche con lo stesso `tag` si sostituiscono invece di accumularsi:
   * tre avvisi di sessione disconnessa restano uno.
   */
  tag?: string;
}

const MAX_BODY = 140;

function accorcia(testo: string): string {
  const pulito = testo.replace(/\s+/g, " ").trim();
  return pulito.length > MAX_BODY ? `${pulito.slice(0, MAX_BODY - 1)}…` : pulito;
}

export function pushSessioneWhatsappDisconnessa(): PushPayload {
  return {
    title: "Sessione WhatsApp disconnessa",
    body: "L'assistente IA è in pausa: le richieste di informazioni non ricevono risposta. Riconnetti la sessione.",
    url: "/leads",
    tag: "whatsapp-sessione",
  };
}

export function pushLeadQualificato(lead: {
  id: string;
  clientName: string;
  propertyRef: string | null;
}): PushPayload {
  const immobile = lead.propertyRef?.trim();
  return {
    title: "Nuovo lead qualificato",
    body: accorcia(immobile ? `${lead.clientName} · ${immobile}` : lead.clientName),
    url: `/leads?id=${encodeURIComponent(lead.id)}`,
    tag: `lead-${lead.id}`,
  };
}

export function pushPubblicazioneNonRiuscita(canali: string[]): PushPayload {
  return {
    title: "Pubblicazione non riuscita",
    body: accorcia(`L'annuncio non è stato pubblicato su ${canali.join(" e ")}. Verifica il collegamento e riprova.`),
    url: "/social",
    tag: "social-pubblicazione",
  };
}

export function pushCreditiAllOttantaPercento(
  cosa: string,
  residui: number,
  aConsumo = false
): PushPayload {
  return {
    title: "Crediti operativi all'80%",
    body: accorcia(
      aConsumo
        ? `${maiuscola(cosa)}: ${residui} incluse residue, poi tariffazione a consumo.`
        : `${maiuscola(cosa)}: ${residui} residue. Valuta una ricarica o un piano superiore.`
    ),
    url: "/settings?tab=billing",
    tag: `crediti-${cosa}`,
  };
}

export function pushCreditiEsauriti(cosa: string): PushPayload {
  return {
    title: "Crediti operativi esauriti",
    body: accorcia(`${maiuscola(cosa)}: funzione sospesa fino a ricarica, cambio piano o nuovo periodo.`),
    url: "/settings?tab=billing",
    tag: `crediti-${cosa}`,
  };
}

export function pushTariffazioneAConsumo(): PushPayload {
  return {
    title: "Tariffazione a consumo attiva",
    body: "Conversazioni WhatsApp incluse esaurite: l'assistente IA continua a operare a consumo.",
    url: "/settings?tab=billing",
    // Stesso tag dell'avviso all'80% sulle conversazioni: lo sostituisce.
    tag: "crediti-conversazioni WhatsApp",
  };
}

function maiuscola(testo: string): string {
  return testo.charAt(0).toUpperCase() + testo.slice(1);
}
