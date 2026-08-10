import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deliverLeadToCrm } from "@/lib/integrations/crm-webhook";

/**
 * Reinvio manuale di un lead al gestionale dell'agenzia.
 *
 * Serve quando l'inoltro automatico su QUALIFIED non è andato a buon fine
 * (gestionale offline, endpoint configurato dopo) e l'agente non vuole
 * aspettare la prossima qualificazione per allineare i due sistemi.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // organizationId nel where: un id di lead indovinato non basta a leggere i
  // dati di un'altra agenzia (CLAUDE.md §5).
  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: session.user.organizationId },
  });

  if (!lead) {
    return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
  }

  const result = await deliverLeadToCrm(lead, "lead.qualified");

  if (!result.ok) {
    return NextResponse.json(
      { error: "delivery_failed", message: result.error },
      { status: 502 }
    );
  }

  return NextResponse.json({ crmDeliveredAt: new Date().toISOString() });
}
