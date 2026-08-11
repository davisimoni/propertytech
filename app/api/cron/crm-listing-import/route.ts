import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readSecret } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { importListingsFromCrm } from "@/lib/integrations/crm/listing-import";

/** Lo scheduler può chiamare in qualsiasi momento: niente cache. */
export const dynamic = "force-dynamic";

/** Stesso confronto a tempo costante di /api/cron/appointment-reminders. */
function isAuthorized(request: Request): boolean {
  const expected = readSecret("CRON_SECRET");
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? request.headers.get("x-cron-secret") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "");

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/**
 * Sincronizza il portafoglio immobili di ogni agenzia che ha configurato
 * l'importazione dal proprio gestionale.
 *
 * Va invocata da uno scheduler esterno con cadenza periodica (es. ogni ora):
 * la sincronizzazione automatica richiesta dall'integrazione CRM è questa,
 * non un'azione che l'agente deve ricordarsi di lanciare a mano.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizations = await prisma.organization.findMany({
    where: { crmListingImportUrl: { not: null } },
    select: { id: true },
  });

  let succeeded = 0;
  let failed = 0;

  for (const organization of organizations) {
    const result = await importListingsFromCrm(organization.id);
    if (result.ok) {
      succeeded++;
    } else {
      failed++;
      console.error("[api/cron/crm-listing-import] Sync fallita", {
        organizationId: organization.id,
        error: result.error,
      });
    }
  }

  const summary = { scanned: organizations.length, succeeded, failed };
  console.info("[api/cron/crm-listing-import] Giro completato", summary);
  return NextResponse.json(summary);
}

/** Vercel Cron invoca in GET: stesso comportamento, stesso controllo. */
export async function GET(request: Request) {
  return POST(request);
}
