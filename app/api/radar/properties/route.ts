import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma, PropertyType } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Opportunità del Radar: aste giudiziarie e ribassi di mercato.
 *
 * Modulo isolato: tabelle proprie, nessuna scrittura sulle entità del nucleo.
 * L'unica lettura verso l'esterno avviene nel matchmaking, che interroga i
 * lead senza modificarli.
 */

const PROPERTY_TYPES: PropertyType[] = [
  "APPARTAMENTO",
  "ATTICO",
  "VILLA",
  "VILLETTA",
  "LOFT",
  "RUSTICO",
  "TERRENO",
  "NEGOZIO",
  "UFFICIO",
  "BOX",
  "ALTRO",
];

const createSchema = z.object({
  kind: z.enum(["ASTA", "RIBASSO"]),
  comune: z.string().trim().min(2, "Indica il comune").max(120),
  zona: z.string().trim().max(120).optional().or(z.literal("")),
  type: z.enum(PROPERTY_TYPES as [PropertyType, ...PropertyType[]]),
  priceEur: z.coerce.number().int().positive("Il prezzo deve essere maggiore di zero"),
  squareMeters: z.coerce.number().int().positive("Indica i metri quadri"),
  basePriceEur: z.coerce.number().int().positive().optional().nullable(),
  previousPriceEur: z.coerce.number().int().positive().optional().nullable(),
  /** Data dell'asta in formato ISO; `null` per i ribassi di mercato. */
  auctionDate: z.string().datetime().optional().nullable(),
  lotto: z.string().trim().max(60).optional().or(z.literal("")),
  sourceUrl: z.string().trim().url("Indirizzo non valido").max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

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

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", message: parsed.error.issues[0]?.message ?? "Dati non validi." },
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
      type: d.type,
      priceEur: d.priceEur,
      squareMeters: d.squareMeters,
      basePriceEur: d.basePriceEur ?? null,
      previousPriceEur: d.previousPriceEur ?? null,
      auctionDate: d.auctionDate ? new Date(d.auctionDate) : null,
      lotto: d.lotto || null,
      sourceUrl: d.sourceUrl || null,
      notes: d.notes || null,
    },
  });

  return NextResponse.json({ item }, { status: 201 });
}
