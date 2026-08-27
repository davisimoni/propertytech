import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { importListingsFromCrm } from "@/lib/integrations/crm/listing-import";

/**
 * Stessa elaborazione della rotta cron, avviata a mano dall'agenzia: qui
 * qualcuno sta guardando lo schermo, e un troncamento diventa un errore
 * inspiegabile invece di una riga di log.
 */
export const maxDuration = 60;

/** Sincronizzazione manuale: il pulsante "Sincronizza ora" in dashboard. */
export async function POST() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await importListingsFromCrm(session.user.organizationId);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
