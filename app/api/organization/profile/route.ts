import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Scheda agenzia: i dati che l'assistente WhatsApp può riferire al cliente.
 *
 * Tutto facoltativo. Un campo vuoto non è un errore: l'assistente ha
 * istruzione di far richiamare un agente per ciò che non sa, che è sempre
 * meglio di un orario inventato.
 */
const profileSchema = z.object({
  address: z.string().trim().max(200).nullable(),
  publicPhone: z.string().trim().max(40).nullable(),
  officeHours: z.string().trim().max(300).nullable(),
  visitHours: z.string().trim().max(300).nullable(),
  knowledgeNotes: z.string().trim().max(2000).nullable(),
});

const SELECT = {
  address: true,
  publicPhone: true,
  officeHours: true,
  visitHours: true,
  knowledgeNotes: true,
} as const;

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: SELECT,
  });

  return NextResponse.json({ profile: organization });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Stringa vuota → `null`, non "": una stringa vuota nel prompt produrrebbe
  // una riga "Indirizzo:" senza valore, che è peggio della riga assente.
  const data = Object.fromEntries(
    Object.entries(parsed.data).map(([key, value]) => [key, value?.trim() || null])
  );

  const updated = await prisma.organization.update({
    where: { id: session.user.organizationId },
    data,
    select: SELECT,
  });

  return NextResponse.json({ profile: updated });
}
