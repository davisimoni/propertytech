import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseChatMessages } from "@/lib/whatsapp/types";

/**
 * Cronologia di una singola conversazione.
 *
 * Esiste per togliere le trascrizioni dalla lista dei lead. Quella lista si
 * aggiorna da sola ogni 15 secondi, e portava con sé `chat: true`: fino a
 * cento conversazioni intere, ogni quindici secondi, per ogni scheda aperta
 * nel browser — mentre la tabella mostra soltanto nome, stato e telefono.
 *
 * I messaggi servono solo quando l'agente apre il dettaglio, ed è lì che
 * vengono chiesti.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // organizationId nel filtro: l'id da solo darebbe accesso alla conversazione
  // di un'altra agenzia, che è il dato più sensibile che abbiamo (CLAUDE.md §5).
  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: session.user.organizationId },
    select: { chat: { select: { messages: true } } },
  });

  if (!lead) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ messages: parseChatMessages(lead.chat?.messages) });
}
