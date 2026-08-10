import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const updateAgencySchema = z.object({
  agencyName: z
    .string()
    .trim()
    .min(2, "Il nome dell'agenzia deve avere almeno 2 caratteri")
    .max(120, "Il nome dell'agenzia è troppo lungo"),
});

/**
 * Completa il profilo dopo una registrazione via Google, dove `agencyName`
 * era stato dedotto dal nome dell'account personale.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateAgencySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_payload",
        message: parsed.error.issues[0]?.message ?? "Nome agenzia non valido.",
      },
      { status: 400 }
    );
  }

  const updated = await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: { agencyName: parsed.data.agencyName, agencyNameConfirmed: true },
    select: { agencyName: true },
  });

  return NextResponse.json({ agencyName: updated.agencyName });
}
