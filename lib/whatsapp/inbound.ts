import "server-only";
import type { Organization, WhatsAppConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "./types";
import { isOptOutMessage } from "./compliance";
import { handleClosedConversation, handleIncomingMessage, handleOptOut } from "./conversation";
import { applyReminderReply, isAwaitingReminderReply, parseReminderReply } from "./reminders";
import { createLeadFromFirstMessage } from "./first-contact";
import { AGENT_COMMAND_REPLIES, parseAgentCommand } from "./agent-commands";
import { sendWhatsAppMessageForProvider } from "./client";
import { resolveWhatsAppCredentials } from "./credentials";
import { recordClientMessage } from "./conversation";
import type { InboundWhatsAppMessage } from "./provider";

export type WhatsAppConfigWithOrganization = WhatsAppConfig & { organization: Organization };

/**
 * Applica un comando scritto dall'agente dentro la chat (`!pausa`,
 * `!riprendi`).
 *
 * La conversazione si identifica **dal JID della chat**, non dal mittente: in
 * un messaggio scritto dall'agenzia il mittente è l'agenzia, mentre l'indirizzo
 * della chat resta quello del cliente ed è l'unica cosa che dice *quale*
 * conversazione mettere in pausa. Il numero resta come ripiego per i trasporti
 * che non espongono un JID.
 */
async function applyAgentCommand(
  config: WhatsAppConfigWithOrganization,
  message: InboundWhatsAppMessage,
  clientPhone: string
): Promise<void> {
  const command = parseAgentCommand(message.text);
  if (!command) return;

  const lead =
    (message.chatJid
      ? await prisma.lead.findFirst({
          where: { organizationId: config.organizationId, waChatJid: message.chatJid },
        })
      : null) ??
    (await prisma.lead.findUnique({
      where: { organizationId_clientPhone: { organizationId: config.organizationId, clientPhone } },
    }));

  if (!lead) {
    console.warn("[WA-AGENT-COMMAND] Comando su una chat senza scheda", {
      organizationId: config.organizationId,
      command,
    });
    return;
  }

  if (command !== "help") {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { aiEnabled: command === "resume_ai" },
    });
  }

  console.info("[WA-AGENT-COMMAND]", {
    leadId: lead.id,
    organizationId: config.organizationId,
    command,
  });

  // La conferma torna nella stessa chat: senza, l'agente non ha modo di sapere
  // se il comando è stato capito, e scoprirebbe di no solo vedendo l'assistente
  // rispondere sopra di lui.
  try {
    await sendWhatsAppMessageForProvider(
      resolveWhatsAppCredentials(config),
      lead.clientPhone,
      AGENT_COMMAND_REPLIES[command],
      lead.waChatJid ?? message.chatJid
    );
  } catch (error) {
    console.error("[WA-AGENT-COMMAND] Conferma non inviata", { leadId: lead.id, error });
  }
}

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

  console.info("[WA-INBOUND-MESSAGE]", {
    organizationId: config.organizationId,
    provider: config.provider,
    // Numero troncato: nei log resta abbastanza per riconoscere una
    // conversazione senza conservare per intero il recapito di una persona
    // che ha solo chiesto informazioni su una casa (CLAUDE.md §5).
    from: `${clientPhone.slice(0, 6)}…`,
    chars: message.text.length,
  });

  /**
   * Comando dell'agente, scritto dentro la chat col cliente.
   *
   * Va risolto **prima** della guardia anti-loop, perché è per definizione un
   * messaggio che arriva dall'agenzia: la guardia lo scarterebbe. È anche
   * l'unico caso in cui accettiamo qualcosa scritto dal numero dell'agenzia,
   * ed è per questo che il microservizio ci inoltra solo i messaggi che sono
   * un comando e nient'altro.
   */
  if (message.fromAgent) {
    await applyAgentCommand(config, message, clientPhone);
    return;
  }

  /**
   * Guardia anti-loop: un messaggio che arriva dal numero **dell'agenzia
   * stessa** non è un cliente da qualificare.
   *
   * Il microservizio QR già scarta i messaggi con `fromMe`, ma affidare la
   * protezione a un solo strato — per giunta in un processo separato, che può
   * essere riavviato o sostituito — significa che il giorno in cui quel
   * filtro sbaglia l'AI apre una scheda sull'agenzia e comincia a farle le
   * domande di qualificazione, consumando crediti a ogni giro. Qui costa un
   * confronto fra stringhe.
   */
  if (config.phoneNumber && clientPhone === normalizePhone(config.phoneNumber)) {
    console.warn("[WA-INBOUND-MESSAGE] Ignorato: mittente uguale al numero dell'agenzia", {
      organizationId: config.organizationId,
    });
    return;
  }

  const existing =
    (await prisma.lead.findUnique({
      where: { organizationId_clientPhone: { organizationId: config.organizationId, clientPhone } },
    })) ??
    // Ripiego sull'indirizzo della chat.
    //
    // Serve nella transizione: una conversazione aperta quando il mittente
    // arrivava come LID ha una scheda con quel LID al posto del numero. Ora che
    // il numero vero e' disponibile, cercare solo per numero non troverebbe
    // nulla e aprirebbe una seconda scheda per la stessa persona, ricominciando
    // la qualificazione da capo davanti a un cliente che sta gia' rispondendo.
    (message.chatJid
      ? await prisma.lead.findFirst({
          where: { organizationId: config.organizationId, waChatJid: message.chatJid },
        })
      : null);

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
        chatJid: message.chatJid,
      });
    } catch (error) {
      console.error("[whatsapp/inbound] Creazione lead da primo contatto fallita", error);
    }
    return;
  }

  // Riparazione dei lead nati prima che il JID venisse conservato, e di quelli
  // la cui chat cambia indirizzo (WhatsApp puo' migrare un contatto a LID).
  // Senza, una scheda creata ieri resterebbe irraggiungibile per sempre.
  let lead = existing;
  if (message.chatJid && existing.waChatJid !== message.chatJid) {
    lead = await prisma.lead.update({
      where: { id: existing.id },
      data: { waChatJid: message.chatJid },
    });
  }

  // Un contatto già in opt-out non riceve più nulla, nemmeno se riscrive.
  if (lead.qualificationStatus === "OPT_OUT") return;

  try {
    const reminderReply = isAwaitingReminderReply(lead) ? parseReminderReply(message.text) : null;

    if (isOptOutMessage(message.text)) {
      await handleOptOut(lead, config);
    } else if (reminderReply) {
      await applyReminderReply(lead, config, reminderReply);
    } else if (!lead.aiEnabled) {
      // Conversazione presa in carico da una persona: l'assistente tace, ma il
      // messaggio entra comunque in cronologia. L'agente che risponde dal
      // telefono deve ritrovare in scheda tutto quello che il cliente ha
      // scritto, altrimenti la chat nella nostra interfaccia diventa una copia
      // parziale e inaffidabile di quella vera.
      //
      // Nessun credito consumato: non abbiamo generato né inviato nulla.
      await recordClientMessage(lead, message.text);
      console.info("[WA-AI-PAUSED]", {
        leadId: lead.id,
        organizationId: config.organizationId,
      });
    } else if (lead.qualificationStatus === "QUALIFIED" || lead.qualificationStatus === "UNQUALIFIED") {
      // Qualificazione conclusa: il ciclo si ferma qui. Rifarlo girare
      // costerebbe una chiamata al modello per ogni frase successiva e, quel
      // che e' peggio, potrebbe ribaltare un esito gia' raggiunto e gia'
      // consegnato al gestionale.
      await handleClosedConversation(lead, config, message.text);
    } else {
      await handleIncomingMessage(
        lead,
        config,
        config.organization.agencyName,
        message.text,
        config.organization
      );
    }
  } catch (error) {
    console.error("[whatsapp/inbound] Message handling failed", { leadId: lead.id, error });
  }
}
