import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Preferenze email della persona collegata (preference center).
 *
 * Per persona e non per agenzia: la newsletter la riceve chi la legge, e un
 * titolare non decide per i collaboratori cosa arriva nella loro casella.
 *
 * Una sola preferenza, di proposito: le email di servizio non sono
 * configurabili. Esporre un interruttore per "sessione WhatsApp disconnessa"
 * significherebbe permettere di spegnere l'unico avviso che dice che
 * l'assistente è fermo.
 */

export async function GET() {
  const session = await auth();
  if (!session?.user?.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const utente = await prisma.user.findUnique({
    where: { id: session.user.userId },
    select: { newsletterOptOutAt: true },
  });

  return NextResponse.json({ newsletter: utente ? utente.newsletterOptOutAt === null : false });
}

const schema = z.object({ newsletter: z.boolean() });

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.userId },
    data: { newsletterOptOutAt: parsed.data.newsletter ? null : new Date() },
  });

  return NextResponse.json({ newsletter: parsed.data.newsletter });
}
