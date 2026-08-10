import type { ChatMessage } from "@/lib/whatsapp/types";

/**
 * Storico delle interazioni su un lead.
 *
 * Modulo puro: fonde la conversazione WhatsApp con gli istanti che il lead
 * registra già (arrivo, appuntamento, promemoria, consegna al gestionale) e li
 * ordina.
 *
 * COSA NON C'È, E PERCHÉ. Non esiste un registro dei *cambi di stato* della
 * qualificazione: il lead conserva solo lo stato corrente, quindi le
 * transizioni passate non sono ricostruibili — e inventare un "passato a
 * Qualificato" con una data verosimile sarebbe peggio che non mostrarlo, perché
 * qui la timeline serve anche a ricordare quando è successo cosa. Si mostra lo
 * stato attuale come voce finale, dichiarato per quello che è.
 */

export type TimelineKind =
  | "created"
  | "message_in"
  | "message_out"
  | "appointment"
  | "reminder"
  | "cancelled"
  | "crm"
  | "status";

export interface TimelineEvent {
  kind: TimelineKind;
  /** ISO. `null` per le voci senza istante noto, che finiscono in coda. */
  at: string | null;
  title: string;
  detail?: string;
}

/** Quante voci mostrare senza espandere: una conversazione lunga non deve invadere la scheda. */
export const TIMELINE_COLLAPSED_COUNT = 8;

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Da contattare",
  IN_PROGRESS: "Qualificazione in corso",
  QUALIFIED: "Qualificato",
  UNQUALIFIED: "Non qualificato",
  OPT_OUT: "Ha revocato il consenso",
};

/**
 * Dati minimi per costruire la timeline, con le date già in ISO.
 *
 * Non è il `Lead` di Prisma di proposito: la stessa funzione gira sul server e
 * nel browser, e il secondo riceve stringhe. Un solo costruttore evita che le
 * due viste divergano.
 */
export interface TimelineSource {
  propertyRef: string;
  qualificationStatus: string;
  createdAt: string;
  updatedAt: string;
  appointmentSlot: string | null;
  appointmentConfirmed: boolean | null;
  reminderSentAt: string | null;
  crmDeliveredAt: string | null;
}

/**
 * Costruisce la timeline, dalla più recente alla più vecchia.
 *
 * Le voci senza istante restano in fondo anziché essere scartate: dicono
 * comunque qualcosa di vero sul lead, solo senza collocazione temporale.
 */
export function buildLeadTimeline(lead: TimelineSource, messages: ChatMessage[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    kind: "created",
    at: lead.createdAt,
    title: "Notizia arrivata",
    detail: lead.propertyRef,
  });

  for (const message of messages) {
    events.push({
      kind: message.sender === "user" ? "message_in" : "message_out",
      at: message.timestamp,
      title: message.sender === "user" ? "Messaggio del cliente" : "Risposta dell'assistente",
      detail: message.text,
    });
  }

  if (lead.appointmentSlot) {
    events.push({
      kind: "appointment",
      at: lead.appointmentSlot,
      title: "Appuntamento fissato",
      // `false` esplicito è diverso da `null`: il primo è una disdetta, il
      // secondo è "non ancora chiesto".
      detail:
        lead.appointmentConfirmed === false
          ? "Il cliente ha poi disdetto"
          : lead.appointmentConfirmed === true
            ? "Confermato dal cliente"
            : undefined,
    });
  }

  if (lead.reminderSentAt) {
    events.push({
      kind: "reminder",
      at: lead.reminderSentAt,
      title: "Promemoria inviato",
    });
  }

  if (lead.crmDeliveredAt) {
    events.push({
      kind: "crm",
      at: lead.crmDeliveredAt,
      title: "Inoltrato al gestionale",
    });
  }

  events.push({
    kind: "status",
    at: lead.updatedAt,
    title: `Stato attuale: ${STATUS_LABELS[lead.qualificationStatus] ?? lead.qualificationStatus}`,
  });

  return events.sort((a, b) => {
    if (!a.at) return 1;
    if (!b.at) return -1;
    return b.at.localeCompare(a.at);
  });
}
