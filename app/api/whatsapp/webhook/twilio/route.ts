import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptAccessToken, resolveWhatsAppCredentials } from "@/lib/whatsapp/credentials";
import { handleInboundWhatsAppMessage } from "@/lib/whatsapp/inbound";
import { sendWhatsAppMessageForProvider } from "@/lib/whatsapp/client";
import { replyToUnsupportedMedia } from "@/lib/whatsapp/conversation";
import { transcribeTwilioVoiceNote } from "@/lib/whatsapp/voice-note";
import { reportWebhookError } from "@/lib/observability/report-error";

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

  const fromPhone = from.replace(/^whatsapp:/, "");
  let corpo = text?.trim() || null;

  /*
   * Vocali: su WhatsApp rispondere a voce è la norma.
   *
   * Twilio non manda il file nel webhook ma il suo indirizzo, in `MediaUrl0`,
   * con il tipo in `MediaContentType0`. Si scarica con le credenziali
   * dell'agenzia e si trascrive con lo stesso percorso della Cloud API, così
   * i due canali si comportano allo stesso modo.
   *
   * Solo il primo media e solo se non c'è testo: una didascalia scritta è già
   * la richiesta del cliente, e trascrivere l'audio in più aggiungerebbe una
   * seconda versione della stessa cosa.
   */
  const mediaUrl = params.get("MediaUrl0");
  const mediaType = params.get("MediaContentType0") ?? "";
  // Il filtro del primo contatto legge la forma del messaggio: un parlato
  // trascritto va dichiarato, o viene giudicato coi criteri dello scritto.
  let daVocale = false;

  if (!corpo && mediaUrl && mediaType.toLowerCase().startsWith("audio/")) {
    const esito = await transcribeTwilioVoiceNote({
      mediaUrl,
      contentType: mediaType,
      accountSid: config.twilioAccountSid ?? "",
      encryptedAuthToken: config.twilioAuthToken,
    });

    if (esito.ok) {
      corpo = esito.text;
      daVocale = true;
    } else {
      // Si risponde comunque: chi ha appena parlato al telefono aspetta una
      // reazione, e il silenzio lo convince che il numero non sia attivo.
      await sendWhatsAppMessageForProvider(
        resolveWhatsAppCredentials(config),
        fromPhone,
        esito.reply
      ).catch((error) => {
        reportWebhookError(error, "whatsapp", "risposta-vocale-twilio");
        console.error("[api/whatsapp/webhook/twilio] Risposta al vocale non inviata", error);
      });

      return twimlResponse();
    }
  }

  // Immagini, documenti, posizioni: non alimentano la qualificazione, ma chi
  // ha appena mandato la foto della cucina si aspetta una reazione.
  if (!corpo) {
    if (mediaUrl) {
      await replyToUnsupportedMedia({
        config,
        organizationId: config.organizationId,
        fromPhone,
      }).catch((error) => {
        reportWebhookError(error, "whatsapp", "invito-a-scrivere-twilio");
        console.error("[api/whatsapp/webhook/twilio] Invito a scrivere non inviato", error);
      });
    }
    return twimlResponse();
  }

  await handleInboundWhatsAppMessage(config, {
    fromPhone,
    profileName,
    text: corpo,
    daVocale,
  }).catch((error) => {
    console.error("[api/whatsapp/webhook/twilio] Message handling failed", error);
  });

  return twimlResponse();
}
