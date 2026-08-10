import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { propertyFieldsSchema } from "@/lib/listings/property-fields";
import { runMatchingForProperty } from "@/lib/matching/run-matching";

const createPropertySchema = propertyFieldsSchema.extend({
  title: z.string().trim().min(3, "Il titolo è troppo corto").max(150),
  description: z.string().trim().max(8000).optional(),
});

/** Immobili in portafoglio, con il numero di lead compatibili. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const properties = await prisma.property.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      leadMatches: {
        orderBy: { score: "desc" },
        include: { lead: { select: { clientName: true, clientPhone: true } } },
      },
    },
  });

  return NextResponse.json({
    properties: properties.map((property) => ({
      id: property.id,
      reference: property.reference,
      title: property.title,
      contract: property.contract,
      type: property.type,
      comune: property.comune,
      provincia: property.provincia,
      zona: property.zona,
      indirizzo: property.indirizzo,
      priceEur: property.priceEur,
      squareMeters: property.squareMeters,
      rooms: property.rooms,
      bathrooms: property.bathrooms,
      floor: property.floor,
      energyClass: property.energyClass,
      description: property.description,
      createdAt: property.createdAt.toISOString(),
      matches: property.leadMatches.map((match) => ({
        id: match.id,
        leadId: match.leadId,
        clientName: match.lead.clientName,
        clientPhone: match.lead.clientPhone,
        score: match.score,
        reasons: match.reasons,
      })),
    })),
  });
}

/** Salva un immobile in portafoglio e ne calcola subito i lead compatibili. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  const body = await request.json().catch(() => null);
  const parsed = createPropertySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", message: parsed.error.issues[0]?.message ?? "Dati non validi." },
      { status: 400 }
    );
  }

  const { reference, ...rest } = parsed.data;

  let property;
  try {
    // upsert sul riferimento: risalvare lo stesso immobile dopo una correzione
    // lo aggiorna invece di rifiutare o duplicare.
    property = await prisma.property.upsert({
      where: { organizationId_reference: { organizationId, reference } },
      create: { organizationId, reference, ...rest },
      update: rest,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("[api/properties] Salvataggio non riuscito", { code: error.code });
      return NextResponse.json({ error: "save_failed" }, { status: 502 });
    }
    throw error;
  }

  // Lo Smart Matching è accessorio: se fallisce, l'immobile resta salvato.
  const matching = await runMatchingForProperty(property).catch((error) => {
    console.error("[api/properties] Matching non riuscito", error);
    return { evaluated: 0, matched: 0 };
  });

  return NextResponse.json({ propertyId: property.id, matching }, { status: 201 });
}
