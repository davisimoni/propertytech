import { NextResponse } from "next/server";
import { z } from "zod";
import type { PropertyType } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isPropertyType, MAX_PRICE_EUR, MAX_SQUARE_METERS } from "@/lib/listings/property-fields";

/**
 * Preferenze di ricerca del lead, alla base dello Smart Matching.
 *
 * Ogni campo è annullabile: l'agente deve poter cancellare un criterio
 * raccolto per errore. Un `null` significa "non dichiarato" e fa sì che quel
 * criterio non pesi sul punteggio, invece di valere zero.
 */
const preferencesSchema = z.object({
  preferredZone: z.string().trim().max(80).nullable().optional(),
  preferredType: z
    .custom<PropertyType>((v) => typeof v === "string" && isPropertyType(v), "Tipologia non valida")
    .nullable()
    .optional(),
  budgetMin: z.number().int().min(0).max(MAX_PRICE_EUR).nullable().optional(),
  budgetMax: z.number().int().min(0).max(MAX_PRICE_EUR).nullable().optional(),
  minSquareMeters: z.number().int().min(0).max(MAX_SQUARE_METERS).nullable().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = preferencesSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", message: parsed.error.issues[0]?.message ?? "Dati non validi." },
      { status: 400 }
    );
  }

  const data = parsed.data;

  if (
    data.budgetMin !== null &&
    data.budgetMin !== undefined &&
    data.budgetMax !== null &&
    data.budgetMax !== undefined &&
    data.budgetMin > data.budgetMax
  ) {
    return NextResponse.json(
      { error: "invalid_range", message: "Il budget minimo supera il massimo." },
      { status: 400 }
    );
  }

  // organizationId nel where: l'isolamento fra agenzie sta nella query.
  const result = await prisma.lead.updateMany({
    where: { id, organizationId: session.user.organizationId },
    data: {
      ...(data.preferredZone !== undefined && { preferredZone: data.preferredZone || null }),
      ...(data.preferredType !== undefined && { preferredType: data.preferredType }),
      ...(data.budgetMin !== undefined && { budgetMin: data.budgetMin }),
      ...(data.budgetMax !== undefined && { budgetMax: data.budgetMax }),
      ...(data.minSquareMeters !== undefined && { minSquareMeters: data.minSquareMeters }),
    },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
  }

  return NextResponse.json({ saved: true });
}
