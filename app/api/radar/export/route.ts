import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildRadarCsv, radarCsvFileName, RADAR_EXPORT_SELECT } from "@/lib/radar/export";

/** Tetto all'export: coerente con lo stesso limite del CSV lead. */
const MAX_ROWS = 2000;

/**
 * Export CSV dei lotti Radar.
 *
 * Stessi filtri e stessa convenzione `archived` della rotta di elenco
 * (`/api/radar/properties`): di default solo i lotti attivi, `archived=only`
 * o `archived=true` per includere quelli chiusi.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;

  const where: Prisma.RadarPropertyWhereInput = {
    organizationId: session.user.organizationId,
    ...(params.get("archived") === "only"
      ? { archivedAt: { not: null } }
      : params.get("archived") === "true"
        ? {}
        : { archivedAt: null }),
  };

  const kind = params.get("kind");
  if (kind === "ASTA" || kind === "RIBASSO") where.kind = kind;

  const items = await prisma.radarProperty.findMany({
    where,
    orderBy: [{ auctionDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: MAX_ROWS,
    select: RADAR_EXPORT_SELECT,
  });

  const csv = buildRadarCsv(items);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${radarCsvFileName()}"`,
      "Cache-Control": "no-store",
    },
  });
}
