import "server-only";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "./types";
import { appendMessage } from "./chat-history";
import { hasSendableCredentials, sendWhatsAppMessageForProvider } from "./client";
import { resolveWhatsAppCredentials } from "./credentials";
import type { WhatsAppConfigWithOrganization } from "./inbound";

/** Vocale oltre il limite consegnabile: non lo si trascrive nemmeno. */
export const VOICE_TOO_LONG_REPLY =
  "Grazie per il messaggio vocale, purtroppo è troppo lungo per essere elaborato. Può riassumerlo in un testo o in un vocale più breve?";

/**
 * Risponde a una nota vocale che non siamo riusciti a trascrivere.
 *
 * Non si resta mai in silenzio: chi ha appena parlato al telefono interpreta
 * l'assenza di risposta come un numero non attivo, e smette di scrivere.
 *
 * # Cosa NON fa
 *
 * Non crea il lead se non esiste, e non consuma crediti. Da un audio
 * illeggibile non si ricava nulla da qualificare, e una scheda nata vuota
 * sporcherebbe la pipeline; la conversazione, se esiste, è già pagata.
 *
 * # Perché registra in cronologia
 *
 * L'agente che apre la scheda deve capire perché c'è un buco: senza questa
 * riga vedrebbe la propria risposta "può scrivermelo?" senza nulla prima, e
 * penserebbe a un guasto invece che a un vocale non comprensibile.
 */
export async function replyToUntranscribableVoiceNote(
  config: WhatsAppConfigWithOrganization,
  message: { from: string; jid?: string },
  reply: string
): Promise<void> {
  try {
    const credentials = resolveWhatsAppCredentials(config);
    if (!hasSendableCredentials(credentials)) return;

    const clientPhone = normalizePhone(message.from);
    const lead = await prisma.lead.findUnique({
      where: {
        organizationId_clientPhone: { organizationId: config.organizationId, clientPhone },
      },
      select: { id: true, qualificationStatus: true, waChatJid: true },
    });

    // Un contatto in opt-out non riceve più nulla, nemmeno una cortesia.
    if (lead?.qualificationStatus === "OPT_OUT") return;

    if (lead) {
      await appendMessage(lead.id, {
        sender: "user",
        text: "[nota vocale non trascritta]",
        timestamp: new Date().toISOString(),
      });
    }

    await sendWhatsAppMessageForProvider(
      credentials,
      clientPhone,
      reply,
      lead?.waChatJid ?? message.jid
    );

    if (lead) {
      await appendMessage(lead.id, {
        sender: "bot",
        text: reply,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("[whatsapp/voice-reply] Risposta non inviata", { error });
  }
}
