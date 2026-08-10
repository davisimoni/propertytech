import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readSecret } from "@/lib/env";
import { sendDueReminders } from "@/lib/whatsapp/reminders";

/** Lo scheduler può chiamare in qualsiasi momento: niente cache. */
export const dynamic = "force-dynamic";

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

/**
 * Invia i promemoria anti no-show dovuti in questo momento.
 *
 * Va invocata da uno scheduler esterno (Vercel Cron, GitHub Actions, cron di
 * sistema) con cadenza almeno oraria: la finestra di scansione è più larga
 * dell'intervallo, così un giro saltato non fa perdere l'appuntamento.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendDueReminders();
    console.info("[api/cron/appointment-reminders] Giro completato", result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/cron/appointment-reminders] Giro fallito", error);
    return NextResponse.json({ error: "reminder_run_failed" }, { status: 500 });
  }
}

/** Vercel Cron invoca in GET: stesso comportamento, stesso controllo. */
export async function GET(request: Request) {
  return POST(request);
}
