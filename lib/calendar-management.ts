import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/plans";
import { getPlanId } from "@/lib/feature-access";

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

export const createSlotSchema = z
  .object({
    agentName: z.string().min(2, "Nome agente troppo corto").max(80),
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

  return prisma.calendarSlot.create({
    data: {
      organizationId,
      agentName: input.agentName,
      startTime: toRomeInstant(input.date, input.startTime),
      endTime: toRomeInstant(input.date, input.endTime),
    },
  });
}
