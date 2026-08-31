import "server-only";
import type { Lead, WhatsAppConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { incrementUsage } from "@/lib/usage";
import { formatSlotForChat } from "@/lib/calendar";
import { resolveCalendarProvider } from "@/lib/calendar/provider";
import {
  hasSendableCredentials,
  sendTypingIndicatorForProvider,
  sendWhatsAppMessageForProvider,
} from "./client";
import { appendMessage } from "./chat-history";
import { buildOpeningMessage, OPT_OUT_CONFIRMATION } from "./compliance";
import { generateAgentReply, AGENT_FALLBACK_MESSAGE, type AgencyProfile } from "@/lib/ai/whatsapp-agent";
import { deliverLeadToCrm } from "@/lib/integrations/crm-webhook";
import { notifyHotLead } from "@/lib/notifications/hot-lead";
import { linkLeadToProperty } from "@/lib/leads/resolve-property";
import { runMatchingForLead } from "@/lib/matching/run-matching";
import { notifyMatchesForLead } from "@/lib/notifications/match-found";
import { notifyLeadNeedsAttention } from "@/lib/notifications/lead-attention";
import { QUALIFICATION_QUESTIONS } from "./questions";
import {
  detectedCountFromQualification,
  deriveSellerCategory,
  reconcileOwnedPropertiesCount,
} from "./portfolio";
import { resolveWhatsAppCredentials } from "./credentials";
import { MEDIA_NUDGE, shouldSendMediaNudge } from "./unsupported-media";
import { normalizePhone, parseChatMessages } from "@/lib/whatsapp/types";
import { hasExceededRate, humanTypingDelay } from "./pacing";

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Riporta sull'agenda esterna dell'agente la visita appena fissata dall'AI.
 *
 * Non lancia e non modifica la risposta al cliente: l'appuntamento è già
 * registrato sull'agenda interna, che resta la fonte di verità dell'agenzia.
 * Un token revocato o Google irraggiungibile non devono trasformare una
 * visita fissata in un messaggio di errore al lead — stesso principio di
 * `deliverLeadToCrm`.
 *
 * Salta in silenzio gli slot generici (`assignedToId: null`): senza un agente
 * non c'è un calendario personale su cui scrivere, e scegliere d'ufficio quello
 * di un collaboratore qualsiasi riempirebbe l'agenda della persona sbagliata.
 */
async function mirrorAppointmentToExternalCalendar(lead: Lead, slotId: string): Promise<void> {
  try {
    const slot = await prisma.calendarSlot.findFirst({
      where: { id: slotId, organizationId: lead.organizationId },
      select: { assignedToId: true, startTime: true, endTime: true },
    });

    if (!slot?.assignedToId) return;

    const { createCalendarEvent } = await import("@/lib/calendar/sync");

    await createCalendarEvent(slot.assignedToId, {
      leadName: lead.clientName,
      startTime: slot.startTime,
      endTime: slot.endTime,
      propertyRef: lead.propertyRef,
      notes: `Telefono lead: ${lead.clientPhone}`,
    });
  } catch (error) {
    console.error("[whatsapp/conversation] Sincronizzazione calendario esterno fallita", {
      leadId: lead.id,
      error,
    });
  }
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

  await sendWhatsAppMessageForProvider(
    resolveWhatsAppCredentials(config),
    lead.clientPhone,
    opening,
    lead.waChatJid
  );

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
      OPT_OUT_CONFIRMATION,
      lead.waChatJid
    );
  } catch (error) {
    console.error("[whatsapp/conversation] Opt-out confirmation not delivered", {
      leadId: lead.id,
      error,
    });
  }
}

/**
 * Registra un messaggio del cliente senza far intervenire l'assistente.
 *
 * Serve quando la conversazione e' stata presa in carico da una persona
 * (`aiEnabled: false`): la chat che l'agente legge in scheda deve restare
 * completa anche mentre l'AI tace, altrimenti diventa una copia parziale di
 * quella vera e non ci si puo' fare affidamento.
 */
export async function recordClientMessage(lead: Lead, text: string): Promise<void> {
  await appendMessage(lead.id, { sender: "user", text, timestamp: nowIso() });
}

/**
 * Elabora un messaggio in arrivo dal cliente: aggiorna la cronologia, chiede
 * all'AI la risposta successiva, persiste le variabili estratte e risponde.
 */
export async function handleIncomingMessage(
  lead: Lead,
  config: WhatsAppConfig,
  agencyName: string,
  incomingText: string,
  agencyProfile?: AgencyProfile
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
      agencyProfile,
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

    if (agentReply.offTopic) {
      // Messaggio che non parla di immobili: si risponde e basta.
      //
      // Nessun campo scritto in scheda e nessun avanzamento di stato: da una
      // pubblicita' o da un numero sbagliato non si ricava un budget, e
      // marcarlo UNQUALIFIED riempirebbe la pipeline dell'agenzia di contatti
      // che nessuno ha mai valutato. `leadUpdate` resta vuoto, quindi piu'
      // avanti non parte nemmeno la consegna al gestionale.
      console.info("[WA-OFF-TOPIC]", { leadId: lead.id });
    } else {
      leadUpdate = {
        mortgageApproved: agentReply.mortgageApproved,
        mustSellFirst: agentReply.mustSellFirst,
        timeframe: agentReply.timeframe,
        budget: agentReply.budget ?? lead.budget,
        // `??` e non sovrascrittura secca, come per il budget: se il cliente ha
        // nominato la zona a inizio conversazione e non la ripete più, i turni
        // successivi restituiscono null e la cancellerebbero.
        preferredZone: agentReply.preferredZone ?? lead.preferredZone,
        qualificationStatus:
          agentReply.outcome === "CONTINUE" ? "IN_PROGRESS" : agentReply.outcome,
        ownedPropertiesCount,
        sellerCategory: deriveSellerCategory(ownedPropertiesCount),
      };
    }

    // Nessun appuntamento da un messaggio fuori contesto: uno slot occupato
    // per una pubblicita' e' tempo dell'agente tolto a un cliente vero.
    const chosen =
      !agentReply.offTopic && agentReply.selectedSlotIndex !== null
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
      } else {
        await mirrorAppointmentToExternalCalendar(lead, chosen.id);
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

  // Prima dell'invio, così il log resta anche se la consegna fallisce: senza,
  // davanti a un cliente che non riceve nulla non si distinguerebbe un'AI che
  // non ha risposto da una risposta che non è partita.
  /**
   * Limite di ritmo per contatto.
   *
   * Controllato PRIMA del ritardo: se l'invio non deve partire, non ha senso
   * pagarne l'attesa. `history` contiene gia' il messaggio del cliente appena
   * arrivato, e il conteggio guarda solo i messaggi dell'assistente.
   *
   * Quando scatta, il messaggio del cliente resta in cronologia e la scheda
   * viene comunque aggiornata: si perde la risposta, non il dato. E' il
   * comportamento voluto — se l'assistente ha gia' scritto tre volte in un
   * minuto, la conversazione non sta procedendo, sta girando su se' stessa.
   */
  if (hasExceededRate(history)) {
    console.warn("[WA-RATE-LIMIT] Invio sospeso: troppi messaggi in un minuto", {
      leadId: lead.id,
      organizationId: lead.organizationId,
    });

    if (Object.keys(leadUpdate).length > 0) {
      await prisma.lead.update({ where: { id: lead.id }, data: leadUpdate });
    }
    return;
  }

  console.info("[WA-AI-RESPONSE]", {
    leadId: lead.id,
    provider: config.provider,
    isFallback: replyText === AGENT_FALLBACK_MESSAGE,
    chars: replyText.length,
    fieldsUpdated: Object.keys(leadUpdate),
  });

  // Ritmo umano: una risposta istantanea e' la firma di un programma, e
  // WhatsApp classifica i numeri anche su questo. Dopo il log e prima
  // dell'invio, cosi' nei registri resta traccia della risposta anche se la
  // consegna fallisce.
  /*
   * Prima l'annuncio, poi l'attesa, poi il messaggio.
   *
   * L'ordine e' quello di una persona: si vede "sta scrivendo...", passa
   * qualche secondo, arriva la risposta. Annunciare dopo l'attesa mostrerebbe
   * l'indicatore per un istante prima del messaggio, che e' peggio di non
   * mostrarlo: si nota che e' finto.
   *
   * L'annuncio non blocca nulla — non lancia e non ha esito — perche' un
   * indicatore mancato non vale il fallimento di una risposta vera.
   */
  const credenziali = resolveWhatsAppCredentials(config);
  await sendTypingIndicatorForProvider(credenziali, lead.clientPhone, lead.waChatJid);

  const attesa = await humanTypingDelay();
  console.info("[WA-TYPING-DELAY]", { leadId: lead.id, ms: attesa });

  await sendWhatsAppMessageForProvider(
    credenziali,
    lead.clientPhone,
    replyText,
    lead.waChatJid
  );

  /**
   * L'assistente non ce l'ha fatta: avvisa chi ha in carico il lead.
   *
   * `replyText` e' rimasto il messaggio di ripiego, quindi il cliente si e'
   * appena sentito dire "un nostro agente la ricontattera'". Da quel momento
   * aspetta una persona, e senza questo avviso nessuno sa che deve muoversi.
   *
   * Si spedisce solo alla PRIMA volta di una serie: se l'ultimo messaggio
   * dell'assistente era gia' il ripiego, il guasto e' lo stesso e una seconda
   * email non aggiunge nulla.
   */
  if (replyText === AGENT_FALLBACK_MESSAGE) {
    const ultimoBot = [...history].reverse().find((m) => m.sender === "bot");
    if (ultimoBot?.text !== AGENT_FALLBACK_MESSAGE) {
      void notifyLeadNeedsAttention(lead);
    }
  }

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

      // Stessa transizione, stessa regola: non blocca e non lancia. Sequenziale
      // e non in parallelo perche' il gestionale ha la precedenza — se una
      // delle due deve arrivare prima e' quella che porta il lead dove
      // l'agenzia lavora davvero.
      await notifyHotLead(updated);

      /**
       * Il lead ha appena finito di dire cosa cerca: e' il momento in cui il
       * portafoglio va interrogato.
       *
       * Finora il matching girava solo alla creazione di un immobile, quindi
       * un acquirente qualificato oggi non veniva mai confrontato con le
       * schede gia' a catalogo. Il collegamento all'immobile di riferimento
       * viene tentato prima, cosi' la scheda risulta gia' agganciata quando
       * l'agente la apre.
       *
       * Tutto non bloccante: la conversazione e' gia' riuscita e pagata.
       */
      await linkLeadToProperty(updated);

      const matching = await runMatchingForLead(updated);
      await notifyMatchesForLead(updated, matching);
    }
  }
}

/** Messaggio di chiusura: la qualificazione e' finita, tocca a una persona. */
export const CONVERSATION_CLOSED_MESSAGE =
  "La ringrazio, ho gia' tutto quello che serve. Un nostro agente la contattera' a breve per i prossimi passi.";

/**
 * Risponde a un cliente la cui qualificazione e' gia' conclusa.
 *
 * # Perche' il ciclo deve fermarsi
 *
 * Finora l'agente AI ripartiva a ogni messaggio, anche su un lead gia'
 * QUALIFIED. Due conseguenze, entrambe silenziose: una chiamata al modello per
 * ogni frase che il cliente scrive dopo aver finito, e soprattutto la
 * possibilita' che l'esito **si ribalti** — una risposta successiva
 * interpretata male trasformava un lead qualificato in UNQUALIFIED, cancellando
 * un risultato gia' raggiunto e gia' consegnato al gestionale.
 *
 * # Perche' non si tace e basta
 *
 * Il messaggio del cliente entra sempre in cronologia, cosi' l'agente lo
 * trova. La risposta di chiusura parte **una volta sola**: se l'ultimo
 * messaggio inviato era gia' quello, si resta in silenzio. Un assistente che
 * ripete la stessa frase a ogni riga e' peggio di uno che non risponde.
 */
export async function handleClosedConversation(
  lead: Lead,
  config: WhatsAppConfig,
  incomingText: string
): Promise<void> {
  const history = await appendMessage(lead.id, {
    sender: "user",
    text: incomingText,
    timestamp: nowIso(),
  });

  const lastBot = [...history].reverse().find((message) => message.sender === "bot");
  if (lastBot?.text === CONVERSATION_CLOSED_MESSAGE) return;

  const credentials = resolveWhatsAppCredentials(config);
  if (!hasSendableCredentials(credentials)) return;

  await sendWhatsAppMessageForProvider(
    credentials,
    lead.clientPhone,
    CONVERSATION_CLOSED_MESSAGE,
    lead.waChatJid
  );

  await appendMessage(lead.id, {
    sender: "bot",
    text: CONVERSATION_CLOSED_MESSAGE,
    timestamp: nowIso(),
  });
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

  await sendWhatsAppMessageForProvider(credentials, fromPhone, MEDIA_NUDGE, lead?.waChatJid);

  // Registrato in cronologia solo se il lead esiste: è ciò che permette di non
  // ripetersi al messaggio successivo.
  if (lead) {
    await appendMessage(lead.id, { sender: "bot", text: MEDIA_NUDGE, timestamp: nowIso() });
  }
}
