import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/plans";
import { getPlanId } from "@/lib/feature-access";
import {
  MAX_RANGE_DAYS,
  MAX_SLOTS_PER_BATCH,
  generateSlots,
  type GeneratedSlot,
} from "@/lib/calendar/batch-slots";
import { fetchBusyIntervalsForAgents } from "@/lib/calendar/sync";

/**
 * Un'"agenda" nel modello di pricing corrisponde a un agente distinto con
 * disponibilità inserite: `agendasLimit` limita quindi il numero di nomi
 * distinti in CalendarSlot, non il numero di slot.
 */
export async function getDistinctAgents(organizationId: string): Promise<string[]> {
  const rows = await prisma.calendarSlot.findMany({
    where: { organizationId },
    distinct: ["agentName"],
    select: { agentName: true },
    orderBy: { agentName: "asc" },
  });

  return rows.map((row) => row.agentName);
}

export interface AgendaQuota {
  used: number;
  limit: number | null;
  canAddAgent: boolean;
}

export async function getAgendaQuota(organizationId: string): Promise<AgendaQuota> {
  const planId = await getPlanId(organizationId);
  const limit = PLANS[planId].agendasLimit;
  const used = (await getDistinctAgents(organizationId)).length;

  return {
    used,
    limit,
    canAddAgent: limit === null || used < limit,
  };
}

/**
 * Collaboratore a cui la disponibilità appartiene davvero.
 *
 * `agentName` resta il nome mostrato al cliente e non cambia; questo è
 * l'account, e serve a due cose che senza di esso non funzionavano affatto:
 * sapere QUALE calendario esterno interrogare per non proporre un orario in
 * cui quella persona è a un rogito, e su quale agenda scrivere la visita
 * quando viene fissata. `null` resta legittimo e significa "slot generico,
 * lo copre chiunque": è il comportamento storico di ogni riga già in archivio.
 */
const assignedToIdSchema = z.string().min(1).max(60).nullable().optional();

export const createSlotSchema = z
  .object({
    agentName: z.string().min(2, "Nome agente troppo corto").max(80),
    assignedToId: assignedToIdSchema,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida"),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Ora di inizio non valida"),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "Ora di fine non valida"),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "L'ora di fine deve essere successiva all'ora di inizio",
    path: ["endTime"],
  });

export type CreateSlotInput = z.infer<typeof createSlotSchema>;

/**
 * Combina data e ora locali dell'agenzia in un istante UTC.
 *
 * Gli orari inseriti dall'agente sono ora italiana: interpretarli come UTC
 * sposterebbe ogni slot di 1-2 ore a seconda dell'ora legale.
 */
export function toRomeInstant(date: string, time: string): Date {
  const naive = new Date(`${date}T${time}:00Z`);

  // Differenza fra l'istante e come Europe/Rome lo interpreta, per ricavare
  // l'offset effettivo in quella data (CET +1 o CEST +2).
  const romeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(naive);

  const get = (type: string) => Number(romeParts.find((part) => part.type === type)?.value ?? "0");
  const asRome = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );

  const offsetMs = asRome - naive.getTime();
  return new Date(naive.getTime() - offsetMs);
}

export class AgendaLimitError extends Error {
  constructor(
    public readonly used: number,
    public readonly limit: number
  ) {
    super(`Limite agende raggiunto (${used}/${limit}).`);
    this.name = "AgendaLimitError";
  }
}

/**
 * Crea uno slot applicando il limite di agende del piano.
 * Un nuovo agente è ammesso solo se il piano ha ancora agende disponibili;
 * aggiungere slot a un agente esistente non consuma quota.
 */
export async function createSlot(organizationId: string, input: CreateSlotInput) {
  const agents = await getDistinctAgents(organizationId);
  const isNewAgent = !agents.includes(input.agentName);

  if (isNewAgent) {
    const planId = await getPlanId(organizationId);
    const limit = PLANS[planId].agendasLimit;

    if (limit !== null && agents.length >= limit) {
      throw new AgendaLimitError(agents.length, limit);
    }
  }

  const assignedToId = await resolveAssignedTo(organizationId, input.assignedToId);

  return prisma.calendarSlot.create({
    data: {
      organizationId,
      agentName: input.agentName,
      assignedToId,
      startTime: toRomeInstant(input.date, input.startTime),
      endTime: toRomeInstant(input.date, input.endTime),
    },
  });
}

/**
 * Verifica che il collaboratore indicato sia dell'agenzia, o lo scarta.
 *
 * Un id arriva dal browser e non si prende per buono: senza questo controllo
 * si potrebbe assegnare una disponibilità all'account di un'altra agenzia
 * indovinandone l'id, e da lì la visita finirebbe sul calendario di un
 * estraneo (CLAUDE.md §5). Scartare e proseguire come slot generico, invece
 * di rifiutare, perché il caso normale di `null` è identico e non c'è ragione
 * di far fallire l'inserimento.
 */
async function resolveAssignedTo(
  organizationId: string,
  assignedToId: string | null | undefined
): Promise<string | null> {
  if (!assignedToId) return null;

  const membro = await prisma.user.findFirst({
    where: { id: assignedToId, organizationId },
    select: { id: true },
  });

  return membro?.id ?? null;
}

export const batchSlotsSchema = z.object({
  agentName: z.string().min(2, "Nome agente troppo corto").max(80),
  assignedToId: assignedToIdSchema,
  /** Date già risolte dal browser: la ricorrenza settimanale e la multi-data arrivano qui uguali. */
  dates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida"))
    .min(1, "Scegli almeno un giorno")
    .max(MAX_RANGE_DAYS, "Periodo troppo lungo"),
  ranges: z
    .array(
      z.object({
        start: z.string().regex(/^\d{2}:\d{2}$/, "Ora di inizio non valida"),
        end: z.string().regex(/^\d{2}:\d{2}$/, "Ora di fine non valida"),
      })
    )
    .min(1, "Aggiungi almeno una fascia oraria")
    .max(6, "Troppe fasce orarie per un solo giorno"),
  slotMinutes: z.number().int().positive().max(600).nullable().optional(),
});

export type BatchSlotsInput = z.infer<typeof batchSlotsSchema>;

export interface BatchSlotsResult {
  created: number;
  /** Già coperti da una disponibilità della stessa persona. */
  saltatiSovrapposti: number;
  /** L'agente risulta occupato sul proprio calendario collegato. */
  saltatiOccupati: number;
  /** Orari già trascorsi nel momento in cui si preme. */
  saltatiPassati: number;
}

export class BatchTooLargeError extends Error {
  constructor(public readonly massimo: number) {
    super(`Troppi slot in una sola operazione (max ${massimo}).`);
    this.name = "BatchTooLargeError";
  }
}

/**
 * Crea in una sola operazione tutte le disponibilità di una ricorrenza.
 *
 * # Le tre ragioni per cui uno slot non viene creato
 *
 * Sovrapposizione con una disponibilità già inserita della stessa persona,
 * impegno reale sul calendario collegato, orario già passato. Nessuna delle
 * tre fa fallire l'operazione: chi imposta "tutti i martedì di ottobre" si
 * aspetta che i martedì liberi vengano aperti anche se su due c'è già
 * qualcosa. I saltati tornano contati, perché un'agenda che silenziosamente
 * crea meno slot di quelli chiesti è indistinguibile da una rotta.
 *
 * # Perché le letture stanno fuori dal ciclo
 *
 * Sia le disponibilità già in archivio sia gli impegni sul calendario esterno
 * si chiedono UNA volta per l'intero periodo, non una per slot. Su "ogni
 * giorno feriale di un mese, ogni ora" sarebbero centosessanta chiamate a
 * Google dentro una singola richiesta HTTP: si arriverebbe al rate limit e
 * l'operazione morirebbe a metà. Così è una query e una chiamata di rete.
 */
export async function createSlotsBatch(
  organizationId: string,
  input: BatchSlotsInput
): Promise<BatchSlotsResult> {
  const agents = await getDistinctAgents(organizationId);

  if (!agents.includes(input.agentName)) {
    const planId = await getPlanId(organizationId);
    const limit = PLANS[planId].agendasLimit;

    if (limit !== null && agents.length >= limit) {
      throw new AgendaLimitError(agents.length, limit);
    }
  }

  /*
   * La generazione si rifà qui, non si accettano gli slot dal browser.
   *
   * Il client calcola gli stessi orari per mostrarne il numero in anteprima,
   * ma un elenco che arriva dalla rete potrebbe contenere qualunque cosa —
   * mille righe, date fuori periodo — e il tetto non varrebbe più nulla. Il
   * browser manda i criteri; le righe le decide questo modulo.
   */
  const { slots, problema } = generateSlots({
    dates: input.dates,
    ranges: input.ranges,
    slotMinutes: input.slotMinutes ?? null,
  });

  if (problema === "troppi_slot") throw new BatchTooLargeError(MAX_SLOTS_PER_BATCH);
  if (slots.length === 0) {
    return { created: 0, saltatiSovrapposti: 0, saltatiOccupati: 0, saltatiPassati: 0 };
  }

  const assignedToId = await resolveAssignedTo(organizationId, input.assignedToId);

  const candidati = slots.map((slot: GeneratedSlot) => ({
    startTime: toRomeInstant(slot.date, slot.start),
    endTime: toRomeInstant(slot.date, slot.end),
  }));

  const adesso = new Date();
  const nonPassati = candidati.filter((slot) => slot.startTime > adesso);
  const saltatiPassati = candidati.length - nonPassati.length;

  if (nonPassati.length === 0) {
    return { created: 0, saltatiSovrapposti: 0, saltatiOccupati: 0, saltatiPassati };
  }

  const periodoInizio = nonPassati[0]!.startTime;
  const periodoFine = nonPassati[nonPassati.length - 1]!.endTime;

  /*
   * Disponibilità già inserite per la stessa persona nel periodo.
   *
   * Il confronto è sull'identità dell'agente in entrambe le forme: il nome
   * mostrato e, quando c'è, l'account. Chi ha collegato il proprio calendario
   * può comparire in archivio con una grafia diversa del nome, e cercare solo
   * per stringa lascerebbe passare un doppione sulla stessa persona.
   */
  const esistenti = await prisma.calendarSlot.findMany({
    where: {
      organizationId,
      startTime: { lt: periodoFine },
      endTime: { gt: periodoInizio },
      OR: assignedToId ? [{ agentName: input.agentName }, { assignedToId }] : [{ agentName: input.agentName }],
    },
    select: { startTime: true, endTime: true },
  });

  /*
   * Impegni reali sul calendario collegato, una sola chiamata per l'intero
   * periodo. Senza account collegato non c'è nulla da chiedere: uno slot
   * generico lo può coprire chiunque, e nessun calendario può smentirlo.
   */
  const impegni = assignedToId
    ? ((await fetchBusyIntervalsForAgents([assignedToId], periodoInizio, periodoFine)).get(
        assignedToId
      ) ?? [])
    : [];

  const siSovrappone = (slot: { startTime: Date; endTime: Date }) =>
    esistenti.some(
      (altro) => slot.startTime < altro.endTime && slot.endTime > altro.startTime
    );

  const eOccupato = (slot: { startTime: Date; endTime: Date }) =>
    impegni.some((impegno) => slot.startTime < impegno.end && slot.endTime > impegno.start);

  let saltatiSovrapposti = 0;
  let saltatiOccupati = 0;
  const daCreare: { startTime: Date; endTime: Date }[] = [];

  for (const slot of nonPassati) {
    if (siSovrappone(slot)) {
      saltatiSovrapposti++;
      continue;
    }
    if (eOccupato(slot)) {
      saltatiOccupati++;
      continue;
    }
    daCreare.push(slot);
  }

  if (daCreare.length === 0) {
    return { created: 0, saltatiSovrapposti, saltatiOccupati, saltatiPassati };
  }

  // `createMany` è una sola istruzione: o entrano tutte le righe o nessuna.
  const { count } = await prisma.calendarSlot.createMany({
    data: daCreare.map((slot) => ({
      organizationId,
      agentName: input.agentName,
      assignedToId,
      startTime: slot.startTime,
      endTime: slot.endTime,
    })),
  });

  return { created: count, saltatiSovrapposti, saltatiOccupati, saltatiPassati };
}
