import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Rimozione di un collaboratore.
 *
 * I lead e gli slot che seguiva non vengono cancellati: le relazioni sono
 * `onDelete: SetNull`, quindi tornano semplicemente non assegnati e restano
 * lavorabili da chiunque in agenzia. Perdere un contatto perché una persona ha
 * lasciato l'agenzia sarebbe il comportamento peggiore possibile.
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "forbidden", message: "Solo il titolare può rimuovere un collaboratore." },
      { status: 403 }
    );
  }

  const { id } = await context.params;

  if (id === session.user.userId) {
    return NextResponse.json(
      { error: "cannot_remove_self", message: "Non puoi rimuovere te stesso dall'agenzia." },
      { status: 400 }
    );
  }

  const target = await prisma.user.findFirst({
    // organizationId nel where: un id indovinato non permette di rimuovere
    // una persona di un'altra agenzia (CLAUDE.md §5).
    where: { id, organizationId: session.user.organizationId },
    select: { id: true, role: true },
  });

  if (!target) {
    return NextResponse.json({ error: "member_not_found" }, { status: 404 });
  }

  // Un'agenzia senza titolare non avrebbe più nessuno in grado di gestire
  // abbonamento, integrazioni e collaboratori.
  if (target.role === "OWNER") {
    const owners = await prisma.user.count({
      where: { organizationId: session.user.organizationId, role: "OWNER" },
    });

    if (owners <= 1) {
      return NextResponse.json(
        {
          error: "last_owner",
          message: "È l'unico titolare dell'agenzia: nominane un altro prima di rimuoverlo.",
        },
        { status: 409 }
      );
    }
  }

  await prisma.user.delete({ where: { id: target.id } });

  return NextResponse.json({ removed: true });
}
