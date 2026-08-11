import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleInboundWhatsAppMessage } from "@/lib/whatsapp/inbound";

const genericInboundSchema = z.object({
  from: z.string().min(6).max(20),
  text: z.string().min(1).max(4000),
  profileName: z.string().max(120).optional(),
});

/**
 * Messaggi in arrivo da un BSP WhatsApp non elencato fra i provider nativi
 * (né Meta né Twilio diretti): l'agenzia — o il suo integratore — inoltra
 * qui `{ from, text, profileName? }` da qualunque relay abbia davanti.
 *
 * Rotta pubblica: l'autenticazione è il token d'ingestione dell'agenzia
 * (stesso meccanismo di /api/whatsapp/inbound-lead, `Authorization: Bearer`
 * oppure `?token=`), non la sessione NextAuth — il chiamante è un sistema
 * esterno, non un browser.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const inboundToken = bearer || url.searchParams.get("token");

  if (!inboundToken) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const config = await prisma.whatsAppConfig.findUnique({
    where: { inboundToken },
    include: { organization: true },
  });

  if (!config) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = genericInboundSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  await handleInboundWhatsAppMessage(config, {
    fromPhone: parsed.data.from,
    profileName: parsed.data.profileName,
    text: parsed.data.text,
  }).catch((error) => {
    console.error("[api/whatsapp/webhook/generic] Message handling failed", error);
  });

  return NextResponse.json({ received: true }, { status: 200 });
}
