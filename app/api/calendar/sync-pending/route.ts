import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { syncSlotToExternalCalendar } from "@/lib/calendar/sync";

/**
 * Riporta sul calendario esterno le visite rimaste indietro.
 *
 * # Perche' serve una rotta e non solo la correzione
 *
 * Perche' gli appuntamenti gia' fissati non si risistemano da soli. Chi ha
 * subito il difetto ha in agenda interna visite che su Google non sono mai
 * comparse, e per quelle non basta che d'ora in poi funzioni: vanno
 * recuperate.
 *
 * # Cosa considera "rimasta indietro"
 *
 * Uno slot prenotato, con un lead collegato, nel futuro, e senza
 * `externalEventId`. Gli appuntamenti passati restano fuori: scrivere oggi in
 * agenda una visita di settimana scorsa non serve a nessuno e sporca il
 * calendario.
 *
 * # Perche' non e' idempotente per caso
 *
 * `syncSlotToExternalCalendar` si ferma se `externalEventId` c'e' gia'.
 * Rieseguire questa rotta due volte non crea eventi doppi — che e' proprio
 * l'errore che rende una resincronizzazione peggiore del problema.
 */
export const maxDuration = 60;

/** Quante ne tenta per chiamata: oltre, si rischia il tetto della funzione. */
const MAX_PER_ESECUZIONE = 25;

async function resincronizza(organizationId: string) {
  const daFare = await prisma.calendarSlot.findMany({
    where: {
      organizationId,
      isBooked: true,
      externalEventId: null,
      startTime: { gte: new Date() },
      // Senza lead non c'e' un appuntamento: e' una fascia libera marcata
      // occupata a mano, e non ha nulla da scrivere in agenda.
      lead: { isNot: null },
    },
    orderBy: { startTime: "asc" },
    take: MAX_PER_ESECUZIONE,
    select: { id: true, startTime: true, agentName: true, lead: { select: { clientName: true } } },
  });

  const esiti = [];
  for (const slot of daFare) {
    const esito = await syncSlotToExternalCalendar(slot.id);
    esiti.push({
      slotId: slot.id,
      quando: slot.startTime.toISOString(),
      cliente: slot.lead?.clientName ?? null,
      agente: slot.agentName,
      ok: esito.ok,
      motivo: esito.motivo,
    });
  }

  const riuscite = esiti.filter((e) => e.ok).length;

  console.info("[CALENDAR-SYNC-PENDING]", {
    organizationId,
    trovate: daFare.length,
    riuscite,
  });

  return { trovate: daFare.length, riuscite, esiti };
}

/**
 * Lanciata dall'agenzia, per la propria agenzia.
 *
 * `organizationId` viene dalla sessione e non dal corpo della richiesta:
 * accettarlo dall'esterno permetterebbe a un'agenzia di far scrivere eventi
 * sul calendario di un'altra.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const esito = await resincronizza(session.user.organizationId);
  return NextResponse.json(esito);
}

/**
 * Stato, senza scrivere niente: quante visite non sono ancora in agenda.
 *
 * Serve al badge in Dashboard, che deve poterlo chiedere a ogni caricamento
 * senza innescare venticinque chiamate a Google.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [nonSincronizzate, sincronizzate] = await Promise.all([
    prisma.calendarSlot.count({
      where: {
        organizationId: session.user.organizationId,
        isBooked: true,
        externalEventId: null,
        startTime: { gte: new Date() },
        lead: { isNot: null },
      },
    }),
    prisma.calendarSlot.count({
      where: {
        organizationId: session.user.organizationId,
        isBooked: true,
        externalEventId: { not: null },
        startTime: { gte: new Date() },
      },
    }),
  ]);

  return NextResponse.json({ nonSincronizzate, sincronizzate });
}
