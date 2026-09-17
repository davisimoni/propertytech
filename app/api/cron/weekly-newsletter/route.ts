import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { inviaNewsletter } from "@/lib/newsletter/send";

/** Lo scheduler può chiamare in qualsiasi momento: niente cache. */
export const dynamic = "force-dynamic";

/**
 * Oltre il limite predefinito di Vercel: il giro invia un'email per utente.
 * L'invio si ferma da solo a 45 secondi e il resto lo completa il controllo
 * giornaliero, quindi 60 basta anche sul piano Hobby.
 */
export const maxDuration = 60;

/**
 * Newsletter del martedì e del giovedì.
 *
 * Pianificata in `vercel.json`. La rotta verifica comunque il giorno in
 * Italia: uno scheduler configurato male non deve poter spedire la
 * newsletter tutti i giorni. `?forza=1` salta quel controllo per una prova
 * manuale, sempre e solo con `CRON_SECRET`.
 */
async function esegui(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const forza = new URL(request.url).searchParams.get("forza") === "1";
  const esito = await inviaNewsletter({ forza });
  return NextResponse.json({ ok: true, ...esito });
}

/** Vercel Cron invoca in GET. */
export const GET = esegui;
export const POST = esegui;
