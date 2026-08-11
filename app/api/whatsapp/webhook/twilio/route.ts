import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptAccessToken } from "@/lib/whatsapp/credentials";
import { handleInboundWhatsAppMessage } from "@/lib/whatsapp/inbound";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twimlResponse(status = 200): NextResponse {
  return new NextResponse(EMPTY_TWIML, { status, headers: { "Content-Type": "text/xml" } });
}

/**
 * Verifica `X-Twilio-Signature`, come documentato da Twilio: HMAC-SHA1
 * dell'URL completo con i parametri POST ordinati alfabeticamente e
 * concatenati senza delimitatori (chiave+valore, niente separatore),
 * chiave l'Auth Token dell'account.
 */
function verifyTwilioSignature(
  authToken: string,
  url: string,
  params: URLSearchParams,
  signature: string
): boolean {
  const sortedKeys = Array.from(params.keys()).sort();
  const data = sortedKeys.reduce((acc, key) => acc + key + (params.get(key) ?? ""), url);

  const expected = createHmac("sha1", authToken).update(data, "utf8").digest("base64");

  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

/**
 * Messaggi in arrivo via Twilio.
 *
 * A differenza di Meta (JSON, handshake GET separato), Twilio manda un corpo
 * form-urlencoded e firma ogni richiesta con l'Auth Token dell'account: non
 * c'è un token di verifica da configurare a parte, la firma stessa fa da
 * autenticazione.
 *
 * Risponde sempre con un TwiML vuoto e 200: un errore applicativo su un
 * singolo messaggio non deve far ritentare Twilio all'infinito.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const params = new URLSearchParams(rawBody);

  const to = params.get("To");
  const from = params.get("From");
  const text = params.get("Body");
  const profileName = params.get("ProfileName") ?? undefined;

  if (!to || !from) return twimlResponse();

  const config = await prisma.whatsAppConfig.findFirst({
    where: { provider: "twilio", twilioWhatsAppNumber: to },
    include: { organization: true },
  });

  if (!config) {
    console.warn("[api/whatsapp/webhook/twilio] Nessuna organizzazione per questo numero");
    return twimlResponse();
  }

  const signature = request.headers.get("x-twilio-signature");
  const authToken = decryptAccessToken(config.twilioAuthToken);

  if (!signature || !authToken || !verifyTwilioSignature(authToken, request.url, params, signature)) {
    console.warn("[api/whatsapp/webhook/twilio] Firma non valida o Auth Token non decifrabile");
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Media (immagini, vocali) non gestiti su questo provider in questa
  // integrazione: rispondiamo comunque 200, nessuna qualificazione da
  // innescare senza testo.
  if (!text) return twimlResponse();

  await handleInboundWhatsAppMessage(config, {
    fromPhone: from.replace(/^whatsapp:/, ""),
    profileName,
    text,
  }).catch((error) => {
    console.error("[api/whatsapp/webhook/twilio] Message handling failed", error);
  });

  return twimlResponse();
}
