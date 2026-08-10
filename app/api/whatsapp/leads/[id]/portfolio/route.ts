import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  deriveSellerCategory,
  MAX_OWNED_PROPERTIES,
} from "@/lib/whatsapp/portfolio";

/**
 * `null` riporta il lead a "non ancora rilevato": serve all'agente che ha
 * inserito un numero per errore e non vuole lasciare un dato inventato in
 * scheda.
 */
const portfolioSchema = z.object({
  ownedPropertiesCount: z
    .number()
    .int("Inserisci un numero intero di immobili")
    .min(0, "Il numero di immobili non può essere negativo")
    .max(MAX_OWNED_PROPERTIES, `Massimo ${MAX_OWNED_PROPERTIES} immobili`)
    .nullable(),
});

/** Aggiornamento manuale del portafoglio immobili di un lead (Modulo 1). */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = portfolioSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_payload",
        message: parsed.error.issues[0]?.message ?? "Valore non valido.",
      },
      { status: 400 }
    );
  }

  const { ownedPropertiesCount } = parsed.data;
  const sellerCategory = deriveSellerCategory(ownedPropertiesCount);

  // updateMany, non update: così l'organizationId entra nella clausola where e
  // l'isolamento fra agenzie è garantito dalla query, non da un controllo
  // applicativo eseguito dopo aver già letto il record (CLAUDE.md §5).
  const result = await prisma.lead.updateMany({
    where: { id, organizationId: session.user.organizationId },
    data: { ownedPropertiesCount, sellerCategory },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
  }

  return NextResponse.json({ ownedPropertiesCount, sellerCategory });
}
