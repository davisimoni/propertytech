import { NextResponse } from "next/server";
import { z } from "zod";
import type { DealStage } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isDealStage } from "@/lib/leads/deal-stage";

/**
 * `z.custom` con la guardia di tipo condivisa: così l'elenco delle fasi vive
 * in un posto solo e il valore arriva a Prisma già tipizzato `DealStage`,
 * senza cast.
 */
const stageSchema = z.object({
  dealStage: z.custom<DealStage>(
    (value) => typeof value === "string" && isDealStage(value),
    "Fase della trattativa non valida."
  ),
});

/**
 * Sposta un lead da una colonna all'altra della board Kanban.
 *
 * Tocca solo `dealStage`: `qualificationStatus` resta di competenza
 * dell'agente AI, e sovrascriverlo da qui farebbe divergere ciò che il bot sa
 * del cliente da ciò che l'agenzia vede in pipeline.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = stageSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_stage" }, { status: 400 });
  }

  // updateMany con organizationId nel where: l'isolamento fra agenzie sta
  // nella query, non in un controllo applicativo a valle (CLAUDE.md §5).
  const result = await prisma.lead.updateMany({
    where: { id, organizationId: session.user.organizationId },
    data: { dealStage: parsed.data.dealStage },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
  }

  return NextResponse.json({ dealStage: parsed.data.dealStage });
}
