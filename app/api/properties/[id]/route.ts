import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { propertyFieldsSchema } from "@/lib/listings/property-fields";
import { PropertyStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  status: z.nativeEnum(PropertyStatus),
});

/**
 * Cambio di stato commerciale dell'immobile.
 *
 * Ha un effetto verso l'esterno che non si vede da questa schermata: uscire da
 * `ACTIVE` toglie l'immobile dal feed XML, e alla rilettura successiva il
 * portale lo ritira dalla pubblicazione. È il comportamento voluto — un
 * venduto non deve restare online — ma è il motivo per cui la UI lo dice
 * esplicitamente invece di limitarsi a cambiare colore a un'etichetta.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  // updateMany e non update: il filtro comprende l'organizationId, quindi una
  // richiesta con l'id di un immobile altrui aggiorna zero righe invece di
  // riuscire (CLAUDE.md §5). Con `update` il vincolo starebbe in una where su
  // chiave primaria, e l'agenzia andrebbe verificata a parte.
  const result = await prisma.property.updateMany({
    where: { id, organizationId: session.user.organizationId },
    data: { status: parsed.data.status },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ status: parsed.data.status });
}

const updateSchema = propertyFieldsSchema.extend({
  title: z.string().trim().min(3, "Il titolo è troppo corto").max(150),
  description: z.string().trim().max(8000).optional(),
});

/**
 * Aggiorna la scheda di un immobile.
 *
 * Le fotografie non passano da qui: si modificano dalla loro sezione, una alla
 * volta, perché sono l'unica parte pesante della scheda. Farle viaggiare
 * insieme a prezzo e descrizione significherebbe rispedire l'intero archivio
 * immagini a ogni correzione di un refuso.
 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  const { id } = await context.params;

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  // Appartenenza verificata prima di scrivere: senza, l'id da solo basterebbe
  // a modificare l'immobile di un'altra agenzia (CLAUDE.md §5).
  const existing = await prisma.property.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { reference, ...rest } = parsed.data;

  try {
    const updated = await prisma.property.update({
      where: { id: existing.id },
      data: {
        ...rest,
        reference,
        provincia: rest.provincia || null,
        zona: rest.zona || null,
        indirizzo: rest.indirizzo || null,
        floor: rest.floor || null,
        description: rest.description || null,
        rooms: rest.rooms ?? null,
        bathrooms: rest.bathrooms ?? null,
        energyClass: rest.energyClass ?? null,
      },
    });

    return NextResponse.json({ property: updated });
  } catch (error) {
    // Il riferimento è unico per agenzia: due immobili con lo stesso codice
    // renderebbero ambiguo il feed verso i portali. Va detto come tale, non
    // come errore generico, o l'agente non sa cosa correggere.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "reference_taken" }, { status: 409 });
    }
    throw error;
  }
}
