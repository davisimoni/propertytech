import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSecret } from "@/lib/env";
import { normalizePhone } from "@/lib/whatsapp/types";
import { handleInboundWhatsAppMessage } from "@/lib/whatsapp/inbound";

/**
 * Eventi dal microservizio: esito dell'abbinamento e messaggi in arrivo.
 *
 * È una rotta **pubblica** — il microservizio non ha una sessione NextAuth —
 * e per questo autenticata con un segreto condiviso. Senza, chiunque
 * conoscesse un `sessionId` potrebbe dichiarare connessa un'agenzia o, molto
 * peggio, iniettarle conversazioni inventate facendo rispondere l'AI a
 * clienti che non hanno mai scritto.
 *
 * Fail-closed: senza `WHATSAPP_SERVICE_TOKEN` configurato risponde 401 a
 * chiunque, invece di restare aperta.
 */

const eventSchema = z.object({
  sessionId: z.string().min(1),
  event: z.enum(["connected", "disconnected", "message"]),
  /** Numero abbinato, presente sugli eventi di connessione. */
  phoneNumber: z.string().optional(),
  /** Messaggio in arrivo, presente solo su `event: "message"`. */
  message: z
    .object({
      from: z.string().min(6),
      text: z.string(),
      profileName: z.string().optional(),
    })
    .optional(),
});

/** Confronto a tempo costante: un confronto ingenuo trasforma il token in un oracolo. */
function tokenMatches(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = readSecret("WHATSAPP_SERVICE_TOKEN");
  if (!expected) {
    console.error("[api/whatsapp/qr/webhook] WHATSAPP_SERVICE_TOKEN assente: rotta chiusa.");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!bearer || !tokenMatches(bearer, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { sessionId, event, phoneNumber, message } = parsed.data;

  // `include` completo e non una `select` parziale: `handleInboundWhatsAppMessage`
  // richiede l'organizzazione intera, ed è lo stesso oggetto che gli passano
  // gli altri webhook di trasporto.
  const config = await prisma.whatsAppConfig.findUnique({
    where: { qrSessionId: sessionId },
    include: { organization: true },
  });

  // Sessione sconosciuta: 200 e non 404. Il microservizio non deve ritentare
  // all'infinito per un'agenzia che nel frattempo si è scollegata.
  if (!config) {
    console.warn("[api/whatsapp/qr/webhook] Sessione sconosciuta", { sessionId });
    return NextResponse.json({ status: "ignored" });
  }

  if (event === "connected") {
    await prisma.whatsAppConfig.update({
      where: { id: config.id },
      data: {
        isConnected: true,
        provider: "qr",
        qrConnectedAt: new Date(),
        ...(phoneNumber ? { phoneNumber } : {}),
      },
    });
    return NextResponse.json({ status: "ok" });
  }

  if (event === "disconnected") {
    // La sessione resta salvata: con un client non ufficiale la caduta è
    // frequente e spesso temporanea. Cancellarla costringerebbe a rifare
    // l'abbinamento da zero a ogni disconnessione passeggera; a staccare
    // davvero è l'agente, dal pulsante "Disconnetti".
    await prisma.whatsAppConfig.update({
      where: { id: config.id },
      data: { isConnected: false },
    });
    return NextResponse.json({ status: "ok" });
  }

  if (!message) {
    return NextResponse.json({ error: "missing_message" }, { status: 400 });
  }

  try {
    await handleInboundWhatsAppMessage(config, {
      fromPhone: normalizePhone(message.from),
      text: message.text,
      profileName: message.profileName,
    });
  } catch (error) {
    // 200 comunque: un errore nostro non deve innescare rinvii a ripetizione
    // dal microservizio, che rischierebbero di far rispondere l'AI più volte
    // allo stesso messaggio.
    console.error("[api/whatsapp/qr/webhook] Gestione messaggio non riuscita", {
      sessionId,
      error,
    });
  }

  return NextResponse.json({ status: "ok" });
}
