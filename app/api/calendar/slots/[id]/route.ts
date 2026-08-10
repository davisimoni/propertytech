import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Il filtro su organizationId nel deleteMany impedisce che un'agenzia possa
  // cancellare uno slot altrui indovinandone l'id (CLAUDE.md §5).
  const deleted = await prisma.calendarSlot.deleteMany({
    where: { id, organizationId: session.user.organizationId, isBooked: false },
  });

  if (deleted.count === 0) {
    // Slot inesistente, di un'altra agenzia, oppure già prenotato: in
    // quest'ultimo caso va disdetto l'appuntamento, non cancellato lo slot.
    return NextResponse.json({ error: "slot_not_deletable" }, { status: 409 });
  }

  return NextResponse.json({ deleted: true });
}
