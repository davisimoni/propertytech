import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readSecret } from "@/lib/env";
import { checkExpiringMandates } from "@/lib/listings/mandate-check";
import { sendDueReminders } from "@/lib/whatsapp/reminders";

/** Lo scheduler può chiamare in qualsiasi momento: niente cache. */
export const dynamic = "force-dynamic";

/**
 * Il giro tocca tutte le agenzie e manda email: sta ampiamente sopra il
 * limite predefinito di Vercel, e senza questa dichiarazione verrebbe
 * interrotto a metà — con alcune agenzie avvisate e altre no, e nessun errore
 * a segnalarlo.
 */
export const maxDuration = 60;

/**
 * Controlli quotidiani in background.
 *
 * # Perché un endpoint solo
 *
 * Ogni controllo periodico che aggiungiamo è una voce in più da configurare
 * nello scheduler, e una in più da ricordarsi di configurare quando si cambia
 * ambiente. Un punto d'ingresso unico che li esegue in sequenza si registra
 * una volta.
 *
 * # Perché i promemoria appuntamento restano anche sul loro endpoint
 *
 * `/api/cron/appointment-reminders` continua a funzionare: chi lo ha già
 * registrato nel proprio scheduler non deve toccare nulla, e i promemoria
 * anti no-show hanno bisogno di girare **più volte al giorno** — un
 * appuntamento alle 9 con preavviso di 24 ore va annunciato alle 9 del giorno
 * prima, non a mezzanotte. Chi vuole entrambi mantiene le due voci; questa
 * rotta li include perché un'agenzia con una sola pianificazione giornaliera
 * abbia comunque i promemoria, sia pure con la granularità che quella
 * pianificazione consente.
 *
 * # Un controllo che fallisce non ferma gli altri
 *
 * I due passaggi sono indipendenti e vengono eseguiti entrambi anche se il
 * primo va male: interrompere il giro alla prima eccezione significherebbe
 * che un guasto sugli incarichi porta via anche i promemoria delle visite.
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

async function runChecks() {
  const esito: Record<string, unknown> = {};

  try {
    esito.incarichi = await checkExpiringMandates();
  } catch (error) {
    console.error("[cron/daily-checks] Controllo incarichi non riuscito", error);
    esito.incarichi = { errore: true };
  }

  try {
    esito.promemoria = await sendDueReminders();
  } catch (error) {
    console.error("[cron/daily-checks] Promemoria non riusciti", error);
    esito.promemoria = { errore: true };
  }

  console.info("[DAILY-CHECKS]", esito);
  return esito;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, ...(await runChecks()) });
}

/**
 * `GET` accettato oltre a `POST`: diversi scheduler — Vercel Cron compreso —
 * invocano solo in GET, e il segreto è comunque richiesto.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, ...(await runChecks()) });
}
