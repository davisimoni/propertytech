import "server-only";
import type { Lead, WhatsAppConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { incrementUsage } from "@/lib/usage";
import { formatSlotForChat } from "@/lib/calendar";
import { resolveCalendarProvider } from "@/lib/calendar/provider";
import { hasSendableCredentials, sendWhatsAppMessageForProvider } from "./client";
import { appendMessage } from "./chat-history";
import { buildOpeningMessage, OPT_OUT_CONFIRMATION } from "./compliance";
import { generateAgentReply, AGENT_FALLBACK_MESSAGE } from "@/lib/ai/whatsapp-agent";
import { deliverLeadToCrm } from "@/lib/integrations/crm-webhook";
import { QUALIFICATION_QUESTIONS } from "./questions";
import {
  detectedCountFromQualification,
  deriveSellerCategory,
  reconcileOwnedPropertiesCount,
} from "./portfolio";
import { resolveWhatsAppCredentials } from "./credentials";
import { MEDIA_NUDGE, shouldSendMediaNudge } from "./unsupported-media";
import { normalizePhone, parseChatMessages } from "@/lib/whatsapp/types";

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Invia il primo messaggio di ingaggio e mette il lead IN_PROGRESS.
 *
 * Il credito è già stato verificato dal chiamante (fail-closed) e viene
 * consumato qui, al primo ingaggio riuscito: si paga la conversazione avviata,
 * non il lead ricevuto.
 */
export async function startConversation(
  lead: Lead,
  config: WhatsAppConfig,
  agencyName: string
): Promise<void> {
  const opening = buildOpeningMessage(
    lead.clientName,
    lead.propertyRef,
    agencyName,
    QUALIFICATION_QUESTIONS.mortgage
  );

  await sendWhatsAppMessageForProvider(resolveWhatsAppCredentials(config), lead.clientPhone, opening);

  await appendMessage(lead.id, { sender: "bot", text: opening, timestamp: nowIso() });

  await prisma.lead.update({
    where: { id: lead.id },
    data: { qualificationStatus: "IN_PROGRESS" },
  });

  await incrementUsage(lead.organizationId, "whatsapp");
}

/**
 * Registra l'opt-out del contatto e invia la conferma di cancellazione.
 *
 * L'aggiornamento di stato precede l'invio: se la Cloud API fallisce, il
 * contatto risulta comunque cancellato — mai il contrario (CLAUDE.md §5).
 */
export async function handleOptOut(lead: Lead, config: WhatsAppConfig): Promise<void> {
  await prisma.lead.update({
    where: { id: lead.id },
    data: { qualificationStatus: "OPT_OUT" },
  });

  await appendMessage(lead.id, {
    sender: "bot",
    text: OPT_OUT_CONFIRMATION,
    timestamp: nowIso(),
  });

  try {
    await sendWhatsAppMessageForProvider(
      resolveWhatsAppCredentials(config),
      lead.clientPhone,
      OPT_OUT_CONFIRMATION
    );
  } catch (error) {
    console.error("[whatsapp/conversation] Opt-out confirmation not delivered", {
      leadId: lead.id,
      error,
    });
  }
}

/**
 * Elabora un messaggio in arrivo dal cliente: aggiorna la cronologia, chiede
 * all'AI la risposta successiva, persiste le variabili estratte e risponde.
 */
export async function handleIncomingMessage(
  lead: Lead,
  config: WhatsAppConfig,
  agencyName: string,
  incomingText: string
): Promise<void> {
  const history = await appendMessage(lead.id, {
    sender: "user",
    text: incomingText,
    timestamp: nowIso(),
  });

  let replyText = AGENT_FALLBACK_MESSAGE;
  let leadUpdate: Parameters<typeof prisma.lead.update>[0]["data"] = {};

  // Gli slot sono recuperati prima della chiamata perché è l'AI stessa a
  // decidere, nello stesso turno, se il lead è qualificato e va invitato.
  // Un lead che ha già un appuntamento non riceve nuove proposte.
  //
  // Passa dall'adapter (lib/calendar/provider.ts) invece che dall'agenda
  // interna direttamente: oggi risolve sempre su `internal`, ma è il seam su
  // cui si innesteranno Google Calendar e Outlook.
  const calendarProvider = await resolveCalendarProvider(lead.organizationId);
  const availableSlots = lead.calendarSlotId
    ? []
    : await calendarProvider.getAvailableSlots(lead.organizationId);

  try {
    const agentReply = await generateAgentReply({
      agencyName,
      clientName: lead.clientName,
      propertyRef: lead.propertyRef,
      history,
      availableSlots: availableSlots.map(formatSlotForChat),
    });

    replyText = agentReply.reply;

    // Lead Intelligence: il portafoglio si ricava da `mustSellFirst`, che
    // l'agente AI estrae già oggi. Nessuna domanda in più al cliente, nessuna
    // chiamata aggiuntiva al modello, nessun campo nuovo nel prompt: solo una
    // lettura diversa di un dato che passava di qui e andava perso.
    const ownedPropertiesCount = reconcileOwnedPropertiesCount(
      lead.ownedPropertiesCount,
      detectedCountFromQualification(agentReply.mustSellFirst)
    );

    leadUpdate = {
      mortgageApproved: agentReply.mortgageApproved,
      mustSellFirst: agentReply.mustSellFirst,
      timeframe: agentReply.timeframe,
      budget: agentReply.budget ?? lead.budget,
      qualificationStatus:
        agentReply.outcome === "CONTINUE" ? "IN_PROGRESS" : agentReply.outcome,
      ownedPropertiesCount,
      sellerCategory: deriveSellerCategory(ownedPropertiesCount),
    };

    const chosen =
      agentReply.selectedSlotIndex !== null
        ? availableSlots[agentReply.selectedSlotIndex - 1]
        : undefined;

    if (chosen) {
      const appointment = await calendarProvider.createAppointment({
        organizationId: lead.organizationId,
        leadId: lead.id,
        slotId: chosen.id,
      });
      if (!appointment.ok) {
        // Lo slot è stato preso da un'altra conversazione fra la proposta e la
        // scelta: meglio dirlo subito che confermare un appuntamento inesistente.
        replyText =
          "Mi dispiace, quell'orario è appena stato prenotato. Un nostro agente la contatterà a breve per concordare una nuova disponibilità.";
      }
    }
  } catch (error) {
    // L'AI non ha risposto: il cliente riceve comunque un messaggio umano e il
    // lead resta IN_PROGRESS perché un agente possa riprenderlo manualmente.
    console.error("[whatsapp/conversation] Agent failed, using fallback", {
      leadId: lead.id,
      error,
    });
  }

  await sendWhatsAppMessageForProvider(resolveWhatsAppCredentials(config), lead.clientPhone, replyText);

  await appendMessage(lead.id, { sender: "bot", text: replyText, timestamp: nowIso() });

  if (Object.keys(leadUpdate).length > 0) {
    const updated = await prisma.lead.update({ where: { id: lead.id }, data: leadUpdate });

    // Il lead ha appena raggiunto QUALIFIED: si inoltra al gestionale
    // dell'agenzia. Il confronto con lo stato precedente evita di rispedirlo a
    // ogni messaggio successivo di una conversazione già qualificata.
    //
    // Non bloccante per costruzione: `deliverLeadToCrm` non lancia mai, così un
    // gestionale offline non fa fallire una conversazione WhatsApp in corso.
    if (
      updated.qualificationStatus === "QUALIFIED" &&
      lead.qualificationStatus !== "QUALIFIED"
    ) {
      await deliverLeadToCrm(updated, "lead.qualified");
    }
  }
}

/**
 * Risponde a un messaggio che l'assistente non sa leggere (foto, documento,
 * posizione, scheda contatto).
 *
 * Non crea il lead se non esiste: da un'immagine non si ricava nulla da
 * qualificare, e una scheda nata vuota sporcherebbe la pipeline. Chi scrive per
 * la prima volta con una foto riceve comunque l'invito a scrivere.
 *
 * Non consuma crediti: la conversazione è già pagata, e far mancare una
 * risposta di cortesia per crediti esauriti è il modo peggiore di risparmiare.
 */
export async function replyToUnsupportedMedia({
  config,
  organizationId,
  fromPhone,
}: {
  config: WhatsAppConfig;
  organizationId: string;
  fromPhone: string;
}): Promise<void> {
  const credentials = resolveWhatsAppCredentials(config);
  if (!hasSendableCredentials(credentials)) return;

  const lead = await prisma.lead.findUnique({
    where: { organizationId_clientPhone: { organizationId, clientPhone: normalizePhone(fromPhone) } },
    include: { chat: true },
  });

  // Un contatto in opt-out non riceve più nulla, nemmeno un invito a scrivere.
  if (lead?.qualificationStatus === "OPT_OUT") return;

  const history = parseChatMessages(lead?.chat?.messages);
  if (!shouldSendMediaNudge(history)) return;

  await sendWhatsAppMessageForProvider(credentials, fromPhone, MEDIA_NUDGE);

  // Registrato in cronologia solo se il lead esiste: è ciò che permette di non
  // ripetersi al messaggio successivo.
  if (lead) {
    await appendMessage(lead.id, { sender: "bot", text: MEDIA_NUDGE, timestamp: nowIso() });
  }
}
