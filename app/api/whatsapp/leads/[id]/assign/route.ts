import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Assegna un lead a un collaboratore, o lo lascia libero.
 *
 * Può farlo chiunque in agenzia, non solo il titolare: passarsi un contatto fra
 * colleghi è un gesto quotidiano, e richiedere il permesso del titolare
 * bloccherebbe il lavoro invece di proteggerlo.
 */
const assignSchema = z.object({
  /** `null` rimette il lead nel mucchio comune. */
  assignedToId: z.string().min(1).max(60).nullable(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = assignSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { assignedToId } = parsed.data;

  // L'assegnatario deve appartenere alla stessa agenzia: senza questo
  // controllo, un id di utente indovinato darebbe visibilità sui lead di un
  // tenant a una persona di un altro (CLAUDE.md §5).
  if (assignedToId) {
    const member = await prisma.user.findFirst({
      where: { id: assignedToId, organizationId },
      select: { id: true },
    });

    if (!member) {
      return NextResponse.json(
        { error: "member_not_found", message: "Questa persona non fa parte della tua agenzia." },
        { status: 404 }
      );
    }
  }

  const result = await prisma.lead.updateMany({
    where: { id, organizationId },
    data: { assignedToId },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
  }

  return NextResponse.json({ assignedToId });
}
