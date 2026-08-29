import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAvailableSlots, formatSlotForChat } from "@/lib/calendar";
import { chatMessagesSchema } from "@/lib/whatsapp/types";
import { isOptOutMessage, OPT_OUT_CONFIRMATION } from "@/lib/whatsapp/compliance";
import { generateAgentReply, WhatsAppAgentError } from "@/lib/ai/whatsapp-agent";

const simulateSchema = z.object({
  clientName: z.string().min(1).max(120),
  propertyRef: z.string().min(1).max(200),
  history: chatMessagesSchema.max(40),
});

/**
 * Anteprima del comportamento dell'agente, per far provare il bot all'agenzia
 * prima di collegare WhatsApp.
 *
 * Differenze deliberate rispetto al flusso reale: non invia nulla via Cloud
 * API, non crea né aggiorna alcun Lead o WhatsAppChat, e non consuma crediti
 * WhatsApp — quei crediti misurano conversazioni con clienti veri.
 */
/**
 * Chiama il modello: sopra il limite predefinito di Vercel.
 *
 * Era l'unica rotta che invoca l'AI rimasta senza dichiarazione. Senza,
 * l'anteprima della conversazione veniva interrotta a meta' e l'agente vedeva
 * il simulatore restare in caricamento all'infinito, senza errore.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = simulateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { clientName, propertyRef, history } = parsed.data;
  const lastMessage = history[history.length - 1];

  if (!lastMessage || lastMessage.sender !== "user") {
    return NextResponse.json({ error: "expected_user_message" }, { status: 400 });
  }

  // L'opt-out è gestito prima dell'AI anche nel flusso reale: la simulazione
  // deve mostrare esattamente lo stesso comportamento.
  if (isOptOutMessage(lastMessage.text)) {
    return NextResponse.json({
      reply: OPT_OUT_CONFIRMATION,
      outcome: "OPT_OUT",
      extracted: null,
    });
  }

  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { agencyName: true },
  });

  const slots = await getAvailableSlots(session.user.organizationId);

  try {
    const agentReply = await generateAgentReply({
      agencyName: organization?.agencyName ?? "la tua agenzia",
      clientName,
      propertyRef,
      history,
      availableSlots: slots.map(formatSlotForChat),
    });

    return NextResponse.json({
      reply: agentReply.reply,
      outcome: agentReply.outcome,
      extracted: {
        mortgageApproved: agentReply.mortgageApproved,
        mustSellFirst: agentReply.mustSellFirst,
        timeframe: agentReply.timeframe,
        budget: agentReply.budget,
      },
    });
  } catch (error) {
    if (error instanceof WhatsAppAgentError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 502 });
    }

    console.error("[api/whatsapp/simulate] Unexpected error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
