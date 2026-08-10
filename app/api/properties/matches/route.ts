import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MATCH_THRESHOLD } from "@/lib/matching/smart-match";

/** Quanti match mostrare nel riquadro di dashboard: è un promemoria, non un elenco. */
const DASHBOARD_LIMIT = 6;

/** Migliori accoppiamenti immobile ↔ lead dell'agenzia, per la dashboard. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const matches = await prisma.propertyLeadMatch.findMany({
    // organizationId nel filtro: nessun match di un'altra agenzia (CLAUDE.md §5).
    where: { organizationId: session.user.organizationId, score: { gte: MATCH_THRESHOLD } },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: DASHBOARD_LIMIT,
    include: {
      lead: { select: { clientName: true, clientPhone: true } },
      property: { select: { reference: true, title: true, comune: true, priceEur: true } },
    },
  });

  return NextResponse.json({
    matches: matches.map((match) => ({
      id: match.id,
      score: match.score,
      reasons: match.reasons,
      clientName: match.lead.clientName,
      clientPhone: match.lead.clientPhone,
      propertyReference: match.property.reference,
      propertyTitle: match.property.title,
      comune: match.property.comune,
      priceEur: match.property.priceEur,
    })),
  });
}
