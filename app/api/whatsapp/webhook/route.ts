import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/whatsapp/types";
import { replyToUnsupportedMedia } from "@/lib/whatsapp/conversation";
import { isHandledMessageType } from "@/lib/whatsapp/unsupported-media";
import { handleInboundWhatsAppMessage } from "@/lib/whatsapp/inbound";
import { transcribeVoiceNote } from "@/lib/whatsapp/voice-note";
import { decryptAccessToken } from "@/lib/whatsapp/credentials";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { readSecret } from "@/lib/env";

/**
 * La rotta più esposta al timeout dell'intera applicazione: un solo messaggio
 * può sommare la trascrizione di una nota vocale, la generazione della
 * risposta con Claude e l'invio — quest'ultimo, per le agenzie collegate via
 * QR, con una chiamata al microservizio che attende fino a 20 secondi.
 *
 * Senza un limite esplicito Vercel tronca la funzione, Meta non riceve il 200
 * e **ritenta lo stesso messaggio**: il cliente si vede rispondere due volte e
 * l'agenzia paga due volte i crediti. Un guasto che colpisce proprio i
 * messaggi più lenti, cioè i vocali.
 */
export const maxDuration = 60;

/**
 * Handshake di verifica webhook di Meta: risponde con hub.challenge in
 * chiaro quando il verify token corrisponde a quello dell'agenzia.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const config = await prisma.whatsAppConfig.findFirst({
    where: { webhookVerifyToken: token },
  });

  if (!config) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

const webhookPayloadSchema = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            metadata: z.object({ phone_number_id: z.string() }).optional(),
            /**
             * Meta include il nome del profilo WhatsApp di chi scrive. Per un
             * contatto che arriva dal QR è l'unico nome disponibile: senza,
             * la scheda nascerebbe con un segnaposto.
             */
            contacts: z
              .array(
                z.object({
                  wa_id: z.string(),
                  profile: z.object({ name: z.string() }).optional(),
                })
              )
              .optional(),
            messages: z
              .array(
                z.object({
                  from: z.string(),
                  type: z.string(),
                  text: z.object({ body: z.string() }).optional(),
                  /**
                   * Nota vocale o file audio. `voice: true` distingue il vocale
                   * registrato sul momento da un brano allegato: entrambi si
                   * trascrivono, ma solo il primo è una risposta al bot.
                   */
                  audio: z
                    .object({
                      id: z.string(),
                      mime_type: z.string().optional(),
                      voice: z.boolean().optional(),
                    })
                    .optional(),
                })
              )
              .optional(),
          }),
        })
      ),
    })
  ),
});

/**
 * Messaggi in arrivo dai clienti.
 *
 * Risponde sempre 200: Meta ritenta in modo aggressivo su qualsiasi non-2xx e
 * un errore applicativo su un singolo messaggio genererebbe una tempesta di
 * retry. Gli errori sono loggati lato server, non propagati a Meta.
 */
/**
 * Verifica `X-Hub-Signature-256`, come documentato da Meta: HMAC-SHA256 del
 * **corpo grezzo** della richiesta, chiave l'App Secret dell'app Meta, valore
 * nell'header nella forma `sha256=<esadecimale>`.
 *
 * # Perché il corpo grezzo e non l'oggetto già interpretato
 *
 * La firma copre i byte esatti che Meta ha spedito. Interpretare il JSON e
 * riserializzarlo produce quasi sempre byte diversi — ordine delle chiavi,
 * spaziatura, come vengono resi i numeri — e il confronto fallirebbe su
 * richieste perfettamente legittime. È l'errore classico di questa verifica,
 * e si manifesta come "tutto rifiutato" senza una causa evidente.
 *
 * # Perché `timingSafeEqual`
 *
 * Un confronto normale esce al primo byte diverso, e il tempo che impiega
 * rivela quanti byte iniziali erano corretti: ripetendo, una firma si indovina
 * un carattere alla volta. Stesso schema già usato per Twilio.
 */
function verifyMetaSignature(appSecret: string, rawBody: string, header: string): boolean {
  const [algoritmo, firmaRicevuta] = header.split("=");
  if (algoritmo !== "sha256" || !firmaRicevuta) return false;

  const atteso = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const attesoBuf = Buffer.from(atteso, "utf8");
  const ricevutoBuf = Buffer.from(firmaRicevuta, "utf8");
  // `timingSafeEqual` lancia su lunghezze diverse: il controllo va fatto
  // prima, e una lunghezza sbagliata è comunque una firma sbagliata.
  if (attesoBuf.length !== ricevutoBuf.length) return false;
  return timingSafeEqual(attesoBuf, ricevutoBuf);
}

export async function POST(request: Request) {
  /*
   * Firma prima di tutto il resto.
   *
   * Senza questa verifica la rotta accettava qualsiasi POST: chi conoscesse un
   * `phone_number_id` — che non e' un segreto, Meta lo restituisce dalle
   * proprie API — poteva iniettare messaggi inventati, far nascere schede,
   * consumare crediti dell'agenzia e soprattutto far scrivere l'assistente a
   * un numero scelto da lui, dal numero WhatsApp dell'agenzia.
   *
   * Fail-closed: senza `META_APP_SECRET` configurato si rifiuta, non si lascia
   * passare. Una verifica che si disattiva da sola quando manca una variabile
   * d'ambiente non e' una verifica, ed e' aggirabile da chiunque riesca a far
   * ripartire l'applicazione senza quel valore.
   */
  const appSecret = readSecret("META_APP_SECRET");
  const firma = request.headers.get("x-hub-signature-256");

  // Il corpo si legge UNA volta sola e come testo: serve identico alla firma,
  // e `request.json()` lo consumerebbe rendendolo irrecuperabile.
  const rawBody = await request.text();

  if (!appSecret) {
    console.error("[api/whatsapp/webhook] META_APP_SECRET assente: rotta chiusa.");
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!firma || !verifyMetaSignature(appSecret, rawBody, firma)) {
    console.warn("[WEBHOOK IGNORATO]: firma X-Hub-Signature-256 assente o non valida", {
      firmaPresente: Boolean(firma),
      byteCorpo: rawBody.length,
    });
    // 403 e non 200: una firma sbagliata non e' un messaggio da riconsegnare,
    // e Meta non ritenta sugli errori di autenticazione come fa sui 5xx.
    return new NextResponse("Forbidden", { status: 403 });
  }

  const payload = ((): unknown => {
    try {
      return JSON.parse(rawBody);
    } catch {
      return null;
    }
  })();
  const parsed = webhookPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    console.warn("[api/whatsapp/webhook] Unrecognized payload shape");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const phoneNumberId = change.value.metadata?.phone_number_id;
      const messages = change.value.messages ?? [];

      if (!phoneNumberId || messages.length === 0) continue;

      const config = await prisma.whatsAppConfig.findFirst({
        where: { metaPhoneAccountId: phoneNumberId },
        include: { organization: true },
      });

      if (!config) {
        console.warn("[api/whatsapp/webhook] No organization for phone_number_id");
        continue;
      }

      for (const message of messages) {
        // Il testo può arrivare scritto oppure parlato: su WhatsApp rispondere
        // a voce è la norma, e finché l'agente leggeva solo il testo quei
        // messaggi si perdevano in silenzio.
        let body: string | null = null;

        if (message.type === "text" && message.text?.body) {
          body = message.text.body;
        } else if (message.type === "audio" && message.audio?.id) {
          const outcome = await transcribeVoiceNote(message.audio.id, config.metaAccessToken);

          if (outcome.ok) {
            body = outcome.text;
          } else {
            // Si risponde comunque: chi ha appena parlato al telefono aspetta
            // una reazione, e il silenzio lo convince che il numero è morto.
            const accessToken = decryptAccessToken(config.metaAccessToken);
            if (accessToken && config.metaPhoneAccountId) {
              await sendWhatsAppMessage(
                { metaAccessToken: accessToken, metaPhoneAccountId: config.metaPhoneAccountId },
                message.from,
                outcome.reply
              ).catch((error) => {
                console.error("[api/whatsapp/webhook] Risposta al vocale non inviata", error);
              });
            }
            continue;
          }
        }

        // Immagini, documenti, posizioni, schede contatto: non alimentano la
        // qualificazione, ma non vanno lasciati cadere nel vuoto. Chi ha appena
        // mandato la foto della cucina si aspetta una reazione, e il silenzio
        // gli fa concludere che il numero non è attivo.
        if (!body) {
          if (isHandledMessageType(message.type)) continue;

          await replyToUnsupportedMedia({
            config,
            organizationId: config.organizationId,
            fromPhone: message.from,
          }).catch((error) => {
            console.error("[api/whatsapp/webhook] Invito a scrivere non inviato", error);
          });

          continue;
        }

        // Il profilo WhatsApp è l'unico nome disponibile per un contatto che
        // scrive per la prima volta: senza, la scheda nascerebbe con un
        // segnaposto.
        const profileName = change.value.contacts?.find(
          (contact) => normalizePhone(contact.wa_id) === normalizePhone(message.from)
        )?.profile?.name;

        // Da qui in poi il flusso è quello condiviso con Twilio e col webhook
        // generico: lookup del lead, opt-out, risposta a un promemoria in
        // attesa, e solo da ultimo la qualificazione via AI (Modulo 1).
        await handleInboundWhatsAppMessage(config, {
          fromPhone: message.from,
          profileName,
          text: body,
        });
      }
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
