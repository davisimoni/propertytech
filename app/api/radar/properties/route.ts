import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  radarPropertyCreateSchema,
  raccogliErroriPerCampo,
} from "@/lib/radar/property-schema";

/**
 * Opportunità del Radar: aste giudiziarie e ribassi di mercato.
 *
 * Modulo isolato: tabelle proprie, nessuna scrittura sulle entità del nucleo.
 * L'unica lettura verso l'esterno avviene nel matchmaking, che interroga i
 * lead senza modificarli.
 */

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;

  // Il filtro sull'agenzia non dipende mai da un parametro (CLAUDE.md §5).
  const where: Prisma.RadarPropertyWhereInput = {
    organizationId: session.user.organizationId,
    // Gli archiviati restano a database ma fuori dall'elenco, salvo richiesta.
    ...(params.get("archived") === "true" ? {} : { archivedAt: null }),
  };

  const kind = params.get("kind");
  if (kind === "ASTA" || kind === "RIBASSO") where.kind = kind;

  const items = await prisma.radarProperty.findMany({
    where,
    // Le aste con una data in avanti per prime: è il vincolo che comanda
    // l'agenda dell'agente. Le altre dietro, dalla più recente.
    orderBy: [{ auctionDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 200,
    include: {
      appraisal: {
        select: {
          status: true,
          risk: true,
          riskReasons: true,
          occupancy: true,
          failureReason: true,
          // Serve al simulatore per precompilare il costo di sanatoria.
          remediationCostMaxEur: true,
        },
      },
      _count: { select: { matches: true } },
    },
  });

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = radarPropertyCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    /*
     * Un messaggio per campo, non uno solo per tutto il modulo.
     *
     * "Invalid input" in cima a quattordici campi non dice quale correggere,
     * e l'agente prova a caso finche' non rinuncia. La mappa campo -> errore
     * permette al modulo di segnare l'input che ha causato il rifiuto.
     */
    const fieldErrors = raccogliErroriPerCampo(parsed.error);

    return NextResponse.json(
      {
        error: "invalid_payload",
        message:
          Object.keys(fieldErrors).length > 0
            ? "Controlla i campi segnalati."
            : "Dati non validi.",
        fieldErrors,
      },
      { status: 400 }
    );
  }

  const d = parsed.data;

  const item = await prisma.radarProperty.create({
    data: {
      organizationId: session.user.organizationId,
      kind: d.kind,
      source: "MANUALE",
      comune: d.comune,
      zona: d.zona || null,
      address: d.address || null,
      type: d.type,
      priceEur: d.priceEur,
      squareMeters: d.squareMeters,
      basePriceEur: d.basePriceEur ?? null,
      previousPriceEur: d.previousPriceEur ?? null,
      auctionDate: d.auctionDate ? new Date(d.auctionDate) : null,
      lotto: d.lotto || null,
      sourceUrl: d.sourceUrl || null,
      notes: d.notes || null,
      // Entrambe o nessuna: una sola coordinata non colloca niente sulla
      // mappa e produrrebbe un pin all'equatore o sul meridiano zero.
      latitude: d.latitude != null && d.longitude != null ? d.latitude : null,
      longitude: d.latitude != null && d.longitude != null ? d.longitude : null,
    },
  });

  return NextResponse.json({ item }, { status: 201 });
}
