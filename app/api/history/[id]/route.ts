import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Dettaglio ed eliminazione di una singola elaborazione.
 *
 * Entrambe le operazioni filtrano per `organizationId` **nella clausola where**,
 * non con un controllo dopo la lettura: interrogare per solo `id` e verificare
 * a valle significa che una dimenticanza in un ramo del codice espone il dato,
 * mentre con il filtro nella query un record di un'altra agenzia semplicemente
 * non esiste.
 */

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const generation = await prisma.aiGeneration.findFirst({
    where: { id, organizationId: session.user.organizationId },
    select: { id: true, kind: true, title: true, output: true, createdAt: true },
  });

  if (!generation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    ...generation,
    createdAt: generation.createdAt.toISOString(),
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // `deleteMany` e non `delete`: accetta il filtro composito su organizzazione
  // e restituisce zero invece di lanciare quando il record non è dell'agenzia.
  const result = await prisma.aiGeneration.deleteMany({
    where: { id, organizationId: session.user.organizationId },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
