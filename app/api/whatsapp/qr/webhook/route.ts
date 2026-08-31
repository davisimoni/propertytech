import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSecret } from "@/lib/env";
import { normalizePhone } from "@/lib/whatsapp/types";
import { handleInboundWhatsAppMessage } from "@/lib/whatsapp/inbound";
import { transcribeVoiceBuffer } from "@/lib/whatsapp/voice-note";
import { replyToUntranscribableVoiceNote, VOICE_TOO_LONG_REPLY } from "@/lib/whatsapp/voice-reply";

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

/**
 * Il percorso completo — creazione del lead, chiamata all'AI, invio della
 * risposta — supera comodamente il limite predefinito di Vercel.
 *
 * Il webhook Meta lo dichiarava gia'; questa rotta e' nata dopo ed era rimasta
 * scoperta. Senza, la funzione viene interrotta a meta': l'AI ha generato la
 * risposta, l'invio non parte, e nei log non resta un errore ma un
 * troncamento — cioe' il caso piu' difficile da diagnosticare.
 */
export const maxDuration = 60;

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
      /** Nota vocale: byte in base64, trascritti qui prima della qualificazione. */
      audio: z
        .object({ data: z.string().min(16), mimeType: z.string().min(3) })
        .optional(),
      /** Vocale troppo lungo per essere consegnato: si risponde senza trascrivere. */
      audioTooLarge: z.boolean().optional(),
      profileName: z.string().optional(),
      /** Indirizzo esatto della chat, dominio incluso. Assente dai microservizi non aggiornati. */
      jid: z.string().min(3).optional(),
      isLid: z.boolean().optional(),
      /** Comando scritto dall'agenzia dentro la chat, non messaggio del cliente. */
      fromAgent: z.boolean().optional(),
      /** Mittente presente nella rubrica del telefono. Assente dai microservizi non aggiornati. */
      isKnownContact: z.boolean().optional(),
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

  const corpo = await request.json().catch(() => null);
  const parsed = eventSchema.safeParse(corpo);
  if (!parsed.success) {
    /*
     * Scarto tracciato, non silenzioso.
     *
     * Questa era l'unica uscita della rotta che non lasciava traccia: un
     * payload rifiutato spariva con un 400 e nei log di Vercel non restava
     * nulla, quindi un lead mai comparso era indistinguibile da un messaggio
     * mai inviato. Si registrano i **campi** che non hanno superato lo schema,
     * mai i loro valori: il testo di un messaggio e il numero di chi scrive
     * sono dati personali e nei log non ci vanno (CLAUDE.md §5).
     */
    console.error("[WA-PAYLOAD-REJECTED] Payload non conforme allo schema", {
      campi: parsed.error.issues.map((i) => `${i.path.join(".") || "(radice)"}: ${i.code}`),
      chiaviRicevute:
        corpo && typeof corpo === "object" ? Object.keys(corpo as object) : "(non e' un oggetto)",
    });
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

    // Avviso all'agenzia solo se era davvero connessa fino a un attimo fa.
    //
    // Il microservizio puo' emettere piu' eventi di disconnessione per la
    // stessa caduta - riconnessioni tentate e fallite - e senza questa
    // condizione l'agenzia riceverebbe una raffica di email per un solo
    // problema.
    if (config.isConnected) {
      try {
        const { resolveOwner } = await import("@/lib/email/recipients");
        const { sendWhatsAppDisconnectedEmail } = await import("@/lib/email/transactional");

        const owner = await resolveOwner(config.organizationId);
        if (owner) {
          const outcome = await sendWhatsAppDisconnectedEmail({
            to: owner.email,
            firstName: owner.firstName,
            phoneNumber: config.phoneNumber,
          });
          console.info("[WA-DISCONNECTED-NOTIFY]", {
            organizationId: config.organizationId,
            outcome,
          });
        }
      } catch (error) {
        console.error("[api/whatsapp/qr/webhook] Avviso di disconnessione non inviato", {
          organizationId: config.organizationId,
          reason: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    return NextResponse.json({ status: "ok" });
  }

  if (!message) {
    return NextResponse.json({ error: "missing_message" }, { status: 400 });
  }

  /**
   * Nota vocale → testo, prima di toccare la qualificazione.
   *
   * Su WhatsApp rispondere a voce e' normale, e un vocale non trascritto
   * interromperebbe il flusso proprio nel momento in cui il cliente sta
   * collaborando. Se la trascrizione non riesce non si resta in silenzio: si
   * risponde chiedendo di scrivere — chi ha appena parlato al telefono
   * interpreta il silenzio come un numero non attivo.
   */
  let messageText = message.text;

  if (message.audioTooLarge) {
    await replyToUntranscribableVoiceNote(config, message, VOICE_TOO_LONG_REPLY);
    return NextResponse.json({ status: "ok" });
  }

  if (message.audio) {
    const outcome = await transcribeVoiceBuffer(
      Buffer.from(message.audio.data, "base64"),
      "nota-vocale.ogg",
      message.audio.mimeType
    );

    if (!outcome.ok) {
      console.warn("[WA-VOICE-NOTE] Trascrizione non riuscita", { reason: outcome.reason });
      await replyToUntranscribableVoiceNote(config, message, outcome.reply);
      return NextResponse.json({ status: "ok" });
    }

    console.info("[WA-VOICE-NOTE]", { chars: outcome.text.length });
    messageText = outcome.text;
  }

  if (!messageText.trim()) {
    // Anche questo scarto lasciava la rotta senza traccia. Un messaggio di soli
    // allegati o di sole emoji finisce qui legittimamente, ma se ci finisce un
    // messaggio vero si deve poterlo vedere.
    console.warn("[WA-EMPTY-TEXT] Messaggio senza testo utilizzabile, ignorato", {
      sessionId,
      haAudio: Boolean(message.audio),
      charsGrezzi: message.text.length,
    });
    return NextResponse.json({ status: "ok" });
  }

  try {
    await handleInboundWhatsAppMessage(config, {
      fromPhone: normalizePhone(message.from),
      text: messageText,
      profileName: message.profileName,
      chatJid: message.jid,
      fromAgent: message.fromAgent,
      isKnownContact: message.isKnownContact,
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
