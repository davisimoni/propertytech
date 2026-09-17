import { NextResponse } from "next/server";
import { ritentaConsumiNonInviati } from "@/lib/billing/overage";
import { isCronAuthorized } from "@/lib/cron/auth";
import { riprendiNewsletterInSospeso } from "@/lib/newsletter/send";
import { sendDueReminders } from "@/lib/whatsapp/reminders";

/** Lo scheduler può chiamare in qualsiasi momento: niente cache. */
export const dynamic = "force-dynamic";

/**
 * Il giro tocca tutte le agenzie e può spedire email: sta ampiamente sopra il
 * limite predefinito di Vercel, e senza questa dichiarazione verrebbe
 * interrotto a metà — con alcune agenzie servite e altre no, e nessun errore
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
 * `/api/cron/appointment-reminders` continua a funzionare: i promemoria anti
 * no-show hanno bisogno di girare **più volte al giorno** — un appuntamento
 * alle 9 con preavviso di 24 ore va annunciato alle 9 del giorno prima, non a
 * mezzanotte. Questa rotta li include perché un'agenzia con una sola
 * pianificazione giornaliera abbia comunque i promemoria, sia pure con la
 * granularità che quella pianificazione consente.
 *
 * # Un controllo che fallisce non ferma gli altri
 *
 * I passaggi sono indipendenti e vengono eseguiti tutti anche se uno va male.
 *
 * Il controllo settimanale degli incarichi in scadenza, che mandava un'email
 * al titolare, non c'è più: le email di sistema sono limitate agli eventi
 * critici dell'account (`lib/email/transactional.ts`), e le scadenze restano
 * visibili nel portafoglio immobili.
 */
async function runChecks() {
  const esito: Record<string, unknown> = {};

  try {
    esito.promemoria = await sendDueReminders();
  } catch (error) {
    console.error("[cron/daily-checks] Promemoria non riusciti", error);
    esito.promemoria = { errore: true };
  }

  // Conversazioni Enterprise oltre l'incluso non ancora arrivate a Stripe
  // (disservizio al momento del consumo): ognuna è un addebito da recuperare.
  try {
    esito.consumiEnterprise = await ritentaConsumiNonInviati();
  } catch (error) {
    console.error("[cron/daily-checks] Ritentativo consumi a pagamento non riuscito", error);
    esito.consumiEnterprise = { errore: true };
  }

  // Newsletter rimasta a metà per il limite di durata della funzione: si
  // completa qui invece di aspettare il numero successivo.
  try {
    esito.newsletter = await riprendiNewsletterInSospeso();
  } catch (error) {
    console.error("[cron/daily-checks] Ripresa newsletter non riuscita", error);
    esito.newsletter = { errore: true };
  }

  console.info("[DAILY-CHECKS]", esito);
  return esito;
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, ...(await runChecks()) });
}

/**
 * `GET` accettato oltre a `POST`: diversi scheduler — Vercel Cron compreso —
 * invocano solo in GET, e il segreto è comunque richiesto.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, ...(await runChecks()) });
}
