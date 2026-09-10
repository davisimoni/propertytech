import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  AgendaLimitError,
  createSlot,
  createSlotSchema,
  getAgendaQuota,
  toRomeInstant,
} from "@/lib/calendar-management";

/**
 * Dati del lead che ha prenotato lo slot, per mostrare in agenda chi arriva.
 *
 * Estratto in una costante, e non scritto in linea nella query, per poterne
 * derivare il tipo: così la forma dichiarata qui e quella davvero richiesta al
 * database restano per forza la stessa cosa.
 */
const SLOT_INCLUDE = {
  lead: { select: { clientName: true, clientPhone: true, propertyRef: true } },
} satisfies Prisma.CalendarSlotInclude;

/**
 * Slot con il lead collegato, tipizzato a partire dallo schema Prisma.
 *
 * L'annotazione esplicita sulla callback del `.map()` non è cosmetica: se il
 * Prisma Client non è stato generato, `prisma.calendarSlot` degrada ad `any` e
 * il parametro diventa un implicit any, che con `strict` fa fallire la build.
 * Il tipo dichiarato rende quel guasto evidente sul tipo invece che su una
 * riga di callback a caso.
 */
type SlotWithLead = Prisma.CalendarSlotGetPayload<{ include: typeof SLOT_INCLUDE }>;

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;

  const [slots, quota] = await Promise.all([
    prisma.calendarSlot.findMany({
      where: { organizationId },
      orderBy: { startTime: "asc" },
      take: 200,
      include: SLOT_INCLUDE,
    }),
    getAgendaQuota(organizationId),
  ]);

  return NextResponse.json({
    quota,
    slots: slots.map((slot: SlotWithLead) => ({
      id: slot.id,
      agentName: slot.agentName,
      // Serve alla scheda per dire se la fascia è di una persona precisa —
      // e quindi incrociata col suo calendario — o generica.
      assignedToId: slot.assignedToId,
      startTime: slot.startTime.toISOString(),
      endTime: slot.endTime.toISOString(),
      isBooked: slot.isBooked,
      bookedBy: slot.lead
        ? {
            clientName: slot.lead.clientName,
            clientPhone: slot.lead.clientPhone,
            propertyRef: slot.lead.propertyRef,
          }
        : null,
    })),
  });
}

/**
 * Cancella in blocco le disponibilità libere di una giornata.
 *
 * Esiste perché ora si creano a decine in un colpo solo: una ricorrenza
 * impostata sul mese sbagliato lascerebbe sessanta righe da togliere una per
 * una, e a quel punto l'agente le lascia lì e l'assistente continua a
 * proporle.
 *
 * Solo le libere, mai le prenotate: quelle hanno un cliente che si presenta,
 * e si disdicono dall'appuntamento — non svuotando un giorno di agenda.
 */
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const day = params.get("day");
  const agentName = params.get("agentName");

  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json(
      { error: "invalid_payload", message: "Indica il giorno da liberare." },
      { status: 400 }
    );
  }

  // Il giorno è quello dell'agenzia, non UTC: `toRomeInstant` sui due estremi
  // evita che una cancellazione "del 15" porti via le 00:30 del 16.
  const inizio = toRomeInstant(day, "00:00");
  const fine = toRomeInstant(day, "23:59");

  const { count } = await prisma.calendarSlot.deleteMany({
    where: {
      organizationId: session.user.organizationId,
      isBooked: false,
      startTime: { gte: inizio, lte: fine },
      ...(agentName ? { agentName } : {}),
    },
  });

  return NextResponse.json({ deleted: count });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSlotSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const slot = await createSlot(session.user.organizationId, parsed.data);
    return NextResponse.json({ slotId: slot.id }, { status: 201 });
  } catch (error) {
    // Il limite di agende è un vincolo di piano: 402 come gli altri paywall,
    // così la UI lo intercetta con lo stesso gestore.
    if (error instanceof AgendaLimitError) {
      return NextResponse.json(
        {
          error: "agenda_limit_exceeded",
          resource: "agendas",
          used: error.used,
          limit: error.limit,
        },
        { status: 402 }
      );
    }

    console.error("[api/calendar/slots] Unexpected error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
