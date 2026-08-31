import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { runRadarMatching } from "@/lib/radar/matching";

/**
 * Lead compatibili con un lotto del Radar.
 *
 * `GET` legge gli abbinamenti già calcolati, `POST` li ricalcola. Sono
 * separati perché il ricalcolo interroga tutti i lead dell'agenzia: farlo a
 * ogni apertura della scheda sarebbe una scansione completa per guardare un
 * elenco che quasi sempre non è cambiato.
 */

export const maxDuration = 60;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const matches = await prisma.auctionLeadMatch.findMany({
    where: { radarPropertyId: id, organizationId: session.user.organizationId },
    orderBy: { score: "desc" },
    take: 50,
    select: {
      id: true,
      score: true,
      reasons: true,
      seenAt: true,
      notifiedAt: true,
      lead: {
        select: {
          id: true,
          clientName: true,
          qualificationStatus: true,
          preferredZone: true,
          budgetMax: true,
        },
      },
    },
  });

  return NextResponse.json({ matches });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const outcome = await runRadarMatching(session.user.organizationId, id);

  return NextResponse.json(outcome);
}
