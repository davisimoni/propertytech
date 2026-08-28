import { NextResponse } from "next/server";
import { z } from "zod";
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
