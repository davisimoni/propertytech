import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readSecret } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { syncSlotToExternalCalendar } from "@/lib/calendar/sync";

/** Lo scheduler può chiamare in qualsiasi momento: niente cache. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Confronto a tempo costante del segreto di pianificazione.
 * Un `===` su stringhe termina al primo byte diverso e lascia misurabile la
 * lunghezza del prefisso corretto.
 */
function isAuthorized(request: Request): boolean {
  const expected = readSecret("CRON_SECRET");
  // Fail-closed: senza segreto configurato la rotta resta chiusa, invece di
  // diventare un endpoint pubblico che chiunque può far girare a ripetizione.
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? request.headers.get("x-cron-secret") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "");

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/** Quante tentarne per giro: oltre, si rischia il tetto della funzione. */
const MAX_PER_GIRO = 30;

/**
 * Recupera le visite che non sono mai arrivate sul calendario esterno.
 *
 * # Perché anche automatica e non solo il pulsante in Dashboard
 *
 * Perché il pulsante lo preme chi si accorge del problema, e il problema è
 * proprio che non si vedeva: una visita assente da Google non si manifesta
 * finché qualcuno non manca all'appuntamento. Un giro periodico la recupera
 * anche per l'agenzia che non ha ancora aperto la dashboard.
 *
 * Un fallimento non è definitivo: senza `externalEventId` lo slot resta nella
 * lista e verrà ritentato al giro successivo — che è quel che serve quando il
 * token era scaduto o Google non rispondeva.
 *
 * Non crea doppioni: `syncSlotToExternalCalendar` si ferma sugli slot che
 * hanno già un `externalEventId`.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const daFare = await prisma.calendarSlot.findMany({
      where: {
        isBooked: true,
        externalEventId: null,
        startTime: { gte: new Date() },
        // Senza lead non è un appuntamento: è una fascia marcata occupata a
        // mano, e non ha niente da scrivere in agenda.
        lead: { isNot: null },
      },
      orderBy: { startTime: "asc" },
      take: MAX_PER_GIRO,
      select: { id: true },
    });

    let riuscite = 0;
    const motivi: Record<string, number> = {};

    for (const slot of daFare) {
      const esito = await syncSlotToExternalCalendar(slot.id);
      if (esito.ok) {
        riuscite += 1;
      } else if (esito.motivo) {
        motivi[esito.motivo] = (motivi[esito.motivo] ?? 0) + 1;
      }
    }

    console.info("[CRON-CALENDAR-SYNC]", { trovate: daFare.length, riuscite, motivi });

    return NextResponse.json({ trovate: daFare.length, riuscite, motivi });
  } catch (error) {
    console.error("[cron/calendar-sync] Giro fallito", error);
    return NextResponse.json({ error: "calendar_sync_failed" }, { status: 500 });
  }
}

/** Alcuni scheduler sanno fare solo GET. Stesso segreto, stesso lavoro. */
export async function GET(request: Request) {
  return POST(request);
}
