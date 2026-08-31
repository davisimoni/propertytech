import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAvailableSlots, formatSlotForChat } from "@/lib/calendar";
import { chatMessagesSchema } from "@/lib/whatsapp/types";
import { isOptOutMessage, OPT_OUT_CONFIRMATION } from "@/lib/whatsapp/compliance";
import { generateAgentReply, WhatsAppAgentError } from "@/lib/ai/whatsapp-agent";
import { classifyIntent } from "@/lib/ai/intent-gateway";
import { sanitizeInboundText } from "@/lib/whatsapp/sanitize";

const simulateSchema = z.object({
  clientName: z.string().min(1).max(120),
  propertyRef: z.string().min(1).max(200),
  history: chatMessagesSchema.max(40),
  /**
   * Primo contatto: la conversazione comincia dal messaggio del cliente, come
   * quando qualcuno scrive all'agenzia senza essere stato contattato prima.
   *
   * Cambia cosa si sta provando. Nella modalita' normale si verifica come
   * l'assistente conduce la qualificazione; qui si verifica se un messaggio
   * **verrebbe raccolto**, che e' la domanda che ci si pone davanti a un lead
   * che non e' comparso in pipeline.
   */
  firstContact: z.boolean().optional(),
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

  const { clientName, propertyRef, history, firstContact } = parsed.data;
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

  /*
   * Stesso filtro del flusso reale, stessa ripulitura.
   *
   * Il simulatore serviva solo a provare come l'assistente conduce la
   * qualificazione, e saltava il gateway: non poteva quindi rispondere alla
   * domanda che ci si pone davanti a un lead mancante — "questo messaggio
   * sarebbe stato raccolto?". Ora la percorre tutta, ripulitura dei caratteri
   * invisibili compresa, cosi' quello che si vede a schermo e' cio' che
   * succederebbe davvero.
   */
  const testoPulito = sanitizeInboundText(lastMessage.text);
  const intent = await classifyIntent({
    message: testoPulito,
    recentContext: history
      .slice(-5, -1)
      .map((m) => `${m.sender === "bot" ? "Agenzia" : "Cliente"}: ${m.text}`),
  });

  if (!intent.pertinente) {
    // Nessuna risposta, esattamente come in produzione: il messaggio viene
    // ignorato e nessuna scheda nasce. Il verdetto torna comunque, perche' il
    // punto del simulatore e' far vedere *perche'*.
    return NextResponse.json({
      reply: null,
      ignored: true,
      intent,
      outcome: "OFF_TOPIC",
      extracted: null,
    });
  }

  try {
    const agentReply = await generateAgentReply({
      agencyName: organization?.agencyName ?? "la tua agenzia",
      clientName,
      propertyRef,
      history: firstContact
        ? // Il testo ripulito prende il posto dell'originale: e' quello su cui
          // lavorerebbe il flusso reale.
          [...history.slice(0, -1), { ...lastMessage, text: testoPulito }]
        : history,
      availableSlots: slots.map(formatSlotForChat),
    });

    return NextResponse.json({
      reply: agentReply.reply,
      ignored: false,
      intent,
      outcome: agentReply.outcome,
      extracted: {
        mortgageApproved: agentReply.mortgageApproved,
        mustSellFirst: agentReply.mustSellFirst,
        timeframe: agentReply.timeframe,
        budget: agentReply.budget,
        preferredZone: agentReply.preferredZone,
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
