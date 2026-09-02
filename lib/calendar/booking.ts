import "server-only";
import { prisma } from "@/lib/prisma";
import type { AvailableSlot } from "./provider";
import { fetchBusyIntervalsForAgents } from "./sync";

/**
 * Disponibilità reale dell'agenzia, e prenotazione di un orario chiesto dal
 * cliente.
 *
 * # Le due fonti, e quale comanda
 *
 * L'agenda interna (`CalendarSlot`, gestita da `/settings/calendar`) dice
 * **quando l'agenzia fa vedere gli immobili**: è la fonte di verità, e resta
 * tale. Il calendario collegato di ciascun agente dice **quando quella persona
 * è realmente occupata**. Un orario è proponibile solo se è vero in entrambe:
 * l'agenzia lo ha aperto, e chi dovrebbe presentarsi non ha già un impegno.
 *
 * Prima questo incrocio non avveniva. `getAgentFreeSlots` era scritta ma non
 * la chiamava nessuno: l'assistente proponeva le fasce dell'agenda interna
 * senza sapere se l'agente in quel momento fosse a un rogito, e la
 * sovrapposizione la scopriva l'agente aprendo il telefono.
 *
 * # Perché il calendario esterno non può dire di no da solo
 *
 * Se il calendario non è collegato o non risponde, gli slot passano come
 * sono. Un servizio esterno lento non deve poter azzerare l'agenda di
 * un'agenzia e far perdere una visita: meglio proporre un orario che *forse*
 * è occupato — l'agente se ne accorge e sposta — che non proporne nessuno.
 */

/** Quanto avanti si guarda quando si cercano orari da proporre. */
const ORIZZONTE_GIORNI = 14;

/**
 * Slot dell'agenzia realmente prenotabili, in ordine cronologico.
 *
 * Gli orari già passati non compaiono: proporre un orario trascorso è peggio
 * che non proporne nessuno.
 */
export async function getBookableSlots(
  organizationId: string,
  limit = 20
): Promise<AvailableSlot[]> {
  const adesso = new Date();
  const fine = new Date(adesso.getTime() + ORIZZONTE_GIORNI * 24 * 60 * 60 * 1000);

  const slots = await prisma.calendarSlot.findMany({
    where: {
      organizationId,
      isBooked: false,
      startTime: { gte: adesso, lt: fine },
    },
    orderBy: { startTime: "asc" },
    take: limit * 3,
  });

  if (slots.length === 0) return [];

  /*
   * Impegni reali, chiesti una volta sola per agente.
   *
   * Interrogare il calendario dentro il ciclo degli slot significherebbe una
   * chiamata di rete per fascia oraria: su un'agenda con venti slot sono venti
   * viaggi, dentro un webhook che ha sessanta secondi in tutto.
   */
  const agenti = [...new Set(slots.map((s) => s.assignedToId).filter((id): id is string => !!id))];
  const impegni = await fetchBusyIntervalsForAgents(agenti, adesso, fine);

  const liberi = slots.filter((slot) => {
    // Slot generico: nessun agente assegnato, quindi nessun calendario da
    // interrogare. Lo può coprire chiunque, e resta proponibile.
    if (!slot.assignedToId) return true;

    const busy = impegni.get(slot.assignedToId);
    if (!busy || busy.length === 0) return true;

    return !busy.some((i) => slot.startTime < i.end && slot.endTime > i.start);
  });

  return liberi.slice(0, limit).map((slot) => ({
    id: slot.id,
    startTime: slot.startTime,
    endTime: slot.endTime,
    agentName: slot.agentName,
  }));
}

/**
 * Lo slot che copre l'orario chiesto dal cliente, se ce n'è uno.
 *
 * # Perché una tolleranza e non l'uguaglianza esatta
 *
 * Perché nessuno chiede "le 11:30". Chiede "verso le 11 e mezza", "alle
 * 11:40", "in tarda mattinata", e il modello traduce in un istante preciso che
 * quasi mai coincide con l'inizio di una fascia. Pretendere l'uguaglianza
 * farebbe rispondere "non disponibile" su una fascia 11:30-12:00 a chi ha
 * chiesto le 11:40, cioè dentro di essa.
 *
 * Si accetta quindi un orario che **cade dentro** la fascia, oppure che le sta
 * vicino entro la tolleranza — così "alle 11:25" prende la fascia che comincia
 * alle 11:30 invece di far ripartire la trattativa sugli orari.
 */
export const TOLLERANZA_MINUTI = 20;

export function findSlotAt(slots: AvailableSlot[], quando: Date): AvailableSlot | null {
  const istante = quando.getTime();

  const dentro = slots.find(
    (s) => istante >= s.startTime.getTime() && istante < s.endTime.getTime()
  );
  if (dentro) return dentro;

  const vicino = slots
    .map((s) => ({ s, scarto: Math.abs(s.startTime.getTime() - istante) }))
    .filter(({ scarto }) => scarto <= TOLLERANZA_MINUTI * 60 * 1000)
    .sort((a, b) => a.scarto - b.scarto)[0];

  return vicino?.s ?? null;
}

/**
 * Gli slot liberi più vicini all'orario che il cliente aveva chiesto.
 *
 * Ordinati per distanza da quell'orario, non per data: chi ha chiesto giovedì
 * mattina vuole sapere cosa c'è attorno a giovedì mattina, non il primo posto
 * libero della settimana prossima.
 */
export function nearestSlots(
  slots: AvailableSlot[],
  quando: Date,
  quanti = 3
): AvailableSlot[] {
  const istante = quando.getTime();

  return [...slots]
    .sort(
      (a, b) =>
        Math.abs(a.startTime.getTime() - istante) - Math.abs(b.startTime.getTime() - istante)
    )
    .slice(0, quanti)
    // Rimessi in ordine di tempo: un elenco di orari da leggere si legge in
    // avanti, anche se il criterio con cui è stato scelto era un altro.
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

/**
 * Data e ora proposte dal cliente, come le ha estratte il modello.
 *
 * Torna `null` su tutto ciò che non è una data valida e futura. Un orario nel
 * passato è quasi sempre un errore di interpretazione — "lunedì" inteso come
 * quello appena trascorso — e prenotarlo creerebbe un appuntamento che
 * nessuno può onorare.
 */
export function parseProposedDateTime(valore: string | null | undefined): Date | null {
  const pulito = valore?.trim();
  if (!pulito) return null;

  const quando = new Date(pulito);
  if (Number.isNaN(quando.getTime())) return null;
  if (quando.getTime() <= Date.now()) return null;

  return quando;
}
