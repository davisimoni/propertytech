import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AI_DISCLAIMER_SHORT } from "@/lib/compliance";
import { formatPrice, PROPERTY_TYPE_LABELS } from "@/lib/listings/property-fields";
import { appendMessage } from "@/lib/whatsapp/chat-history";
import { hasSendableCredentials, sendWhatsAppMessageForProvider } from "@/lib/whatsapp/client";
import { resolveWhatsAppCredentials } from "@/lib/whatsapp/credentials";

const schema = z.object({ propertyId: z.string().min(1) });

/**
 * Propone un immobile a un lead via WhatsApp.
 *
 * # È un invio dell'agente, non dell'assistente
 *
 * Parte da un clic su un abbinamento, non da una decisione del modello: il
 * testo è composto qui dai dati della scheda e non generato. Un'agenzia deve
 * poter sapere esattamente cosa è stato scritto a un suo cliente, e un
 * messaggio prodotto da un modello a ogni invio non dà quella garanzia.
 *
 * # Non consuma crediti
 *
 * La conversazione con quel contatto è già stata pagata quando è stata
 * avviata. Far mancare una proposta commerciale perché il contatore mensile è
 * esaurito bloccherebbe proprio il momento in cui il software produce valore.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  const { id } = await context.params;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Lead e immobile verificati entrambi sull'agenzia: senza, due id indovinati
  // permetterebbero di scrivere al contatto di un'altra agenzia (CLAUDE.md §5).
  const [lead, property, config] = await Promise.all([
    prisma.lead.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        clientName: true,
        clientPhone: true,
        waChatJid: true,
        qualificationStatus: true,
      },
    }),
    prisma.property.findFirst({
      where: { id: parsed.data.propertyId, organizationId },
      select: {
        reference: true,
        title: true,
        type: true,
        comune: true,
        zona: true,
        priceEur: true,
        squareMeters: true,
        rooms: true,
      },
    }),
    prisma.whatsAppConfig.findUnique({ where: { organizationId } }),
  ]);

  if (!lead || !property) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Un contatto in opt-out non riceve più nulla, nemmeno una proposta che
  // l'agente ritiene interessante (CLAUDE.md §5).
  if (lead.qualificationStatus === "OPT_OUT") {
    return NextResponse.json(
      { error: "opt_out", message: "Questo contatto ha revocato il consenso." },
      { status: 409 }
    );
  }

  if (!config || !hasSendableCredentials(resolveWhatsAppCredentials(config))) {
    return NextResponse.json(
      { error: "whatsapp_not_connected", message: "WhatsApp non è collegato." },
      { status: 409 }
    );
  }

  // Forma di cortesia: parla l'agenzia a un cliente (CLAUDE.md §1).
  const testo = [
    `Buongiorno ${lead.clientName}, abbiamo un immobile che potrebbe interessarle:`,
    "",
    `${PROPERTY_TYPE_LABELS[property.type]} — ${property.title}`,
    [
      property.zona ? `${property.comune} (${property.zona})` : property.comune,
      `${property.squareMeters} mq`,
      property.rooms ? `${property.rooms} locali` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    `Prezzo: ${formatPrice(property.priceEur)}`,
    `Riferimento: ${property.reference}`,
    "",
    "Se le interessa, possiamo organizzare una visita: mi faccia sapere quando le è comodo.",
    "",
    "---",
    AI_DISCLAIMER_SHORT,
  ].join("\n");

  try {
    await sendWhatsAppMessageForProvider(
      resolveWhatsAppCredentials(config),
      lead.clientPhone,
      testo,
      lead.waChatJid
    );
  } catch (error) {
    console.error("[api/whatsapp/leads/propose] Invio non riuscito", {
      leadId: lead.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "send_failed", message: "Invio non riuscito. Riprova." },
      { status: 502 }
    );
  }

  // In cronologia come messaggio dell'assistente: è ciò che il cliente vede
  // arrivare dal numero dell'agenzia, e la chat in scheda deve corrispondere a
  // quella vera.
  await appendMessage(lead.id, {
    sender: "bot",
    text: testo,
    timestamp: new Date().toISOString(),
  });

  console.info("[LEAD-PROPOSE]", { leadId: lead.id, propertyId: parsed.data.propertyId });

  return NextResponse.json({ sent: true });
}
