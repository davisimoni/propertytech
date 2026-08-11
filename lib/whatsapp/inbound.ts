import "server-only";
import type { Organization, WhatsAppConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "./types";
import { isOptOutMessage } from "./compliance";
import { handleIncomingMessage, handleOptOut } from "./conversation";
import { applyReminderReply, isAwaitingReminderReply, parseReminderReply } from "./reminders";
import { createLeadFromFirstMessage } from "./first-contact";
import type { InboundWhatsAppMessage } from "./provider";

export type WhatsAppConfigWithOrganization = WhatsAppConfig & { organization: Organization };

/**
 * Orchestrazione condivisa fra tutti i provider di trasporto.
 *
 * Qualunque sia stata la strada — Meta, Twilio, un webhook generico — da qui
 * in poi il flusso è identico: è il punto che garantisce che un messaggio in
 * arrivo attivi sempre il Modulo 1, invece di farlo dipendere dai dettagli di
 * ciascuna route di webhook (che restano responsabili solo di autenticare la
 * richiesta e tradurre il proprio payload in `InboundWhatsAppMessage`).
 *
 * Ordine deliberato: l'opt-out vince su tutto, poi la risposta a un
 * promemoria in attesa, e solo da ultimo la conversazione con l'AI. Un "NO" a
 * un promemoria deve liberare l'agenda, non finire in pasto al modello che lo
 * leggerebbe come risposta di qualificazione.
 */
export async function handleInboundWhatsAppMessage(
  config: WhatsAppConfigWithOrganization,
  message: InboundWhatsAppMessage
): Promise<void> {
  const clientPhone = normalizePhone(message.fromPhone);

  const existing = await prisma.lead.findUnique({
    where: { organizationId_clientPhone: { organizationId: config.organizationId, clientPhone } },
  });

  // Numero mai visto: è la persona che ha scritto per prima (QR in vetrina,
  // sandbox Twilio, ecc.). La scheda nasce qui e la qualificazione parte
  // subito, qualunque sia stato il trasporto.
  if (!existing) {
    try {
      await createLeadFromFirstMessage({
        config,
        agencyName: config.organization.agencyName,
        fromPhone: message.fromPhone,
        profileName: message.profileName,
        messageText: message.text,
      });
    } catch (error) {
      console.error("[whatsapp/inbound] Creazione lead da primo contatto fallita", error);
    }
    return;
  }

  const lead = existing;

  // Un contatto già in opt-out non riceve più nulla, nemmeno se riscrive.
  if (lead.qualificationStatus === "OPT_OUT") return;

  try {
    const reminderReply = isAwaitingReminderReply(lead) ? parseReminderReply(message.text) : null;

    if (isOptOutMessage(message.text)) {
      await handleOptOut(lead, config);
    } else if (reminderReply) {
      await applyReminderReply(lead, config, reminderReply);
    } else {
      await handleIncomingMessage(lead, config, config.organization.agencyName, message.text);
    }
  } catch (error) {
    console.error("[whatsapp/inbound] Message handling failed", { leadId: lead.id, error });
  }
}
