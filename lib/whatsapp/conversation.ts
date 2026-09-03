import "server-only";
import type { Lead, WhatsAppConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { incrementUsage } from "@/lib/usage";
import { formatSlotForChat } from "@/lib/calendar";
import { resolveCalendarProvider } from "@/lib/calendar/provider";
import {
  findSlotAt,
  getBookableSlots,
  nearestSlots,
  parseProposedDateTime,
} from "@/lib/calendar/booking";
import {
  hasSendableCredentials,
  sendTypingIndicatorForProvider,
  sendWhatsAppMessageForProvider,
} from "./client";
import { appendMessage } from "./chat-history";
import { buildOpeningMessage, OPT_OUT_CONFIRMATION } from "./compliance";
import {
  generateAgentReply,
  vuotoComeNull,
  AGENT_FALLBACK_MESSAGE,
  type AgencyProfile,
} from "@/lib/ai/whatsapp-agent";
import { deliverLeadToCrm } from "@/lib/integrations/crm-webhook";
import { notifyHotLead } from "@/lib/notifications/hot-lead";
import { notifyAppointmentConfirmed } from "@/lib/notifications/appointment";
import { linkLeadToProperty } from "@/lib/leads/resolve-property";
import { runMatchingForLead } from "@/lib/matching/run-matching";
import { notifyMatchesForLead } from "@/lib/notifications/match-found";
import { notifyLeadNeedsAttention } from "@/lib/notifications/lead-attention";
import { QUALIFICATION_QUESTIONS } from "./questions";
import { CONTRACT_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/listings/property-fields";
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
      leadPhone: lead.clientPhone,
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
  /*
   * L'apertura cambia secondo cosa e' venuto a chiedere.
   *
   * A chi vuole vendere si chiede dove sta l'immobile; a chi vuole comprare,
   * cosa cerca e dove. Sbagliare qui costa piu' che altrove: e' la prima
   * frase, e nessuno la corregge dopo.
   *
   * Con `intent` a null — il filtro non ha capito — si apre col percorso
   * d'acquisto, che resta il caso di gran lunga piu' frequente per un numero
   * pubblicato sui portali.
   */
  const opening = buildOpeningMessage(
    lead.clientName,
    lead.propertyRef,
    agencyName,
    lead.intent === "VENDITA"
      ? QUALIFICATION_QUESTIONS.sellerLocation
      : QUALIFICATION_QUESTIONS.searchCriteria
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

  /*
   * Orari proponibili: fasce aperte dall'agenzia MENO gli impegni reali.
   *
   * `getBookableSlots` incrocia le due fonti. Prima si leggeva la sola agenda
   * interna, quindi l'assistente poteva proporre un orario in cui l'agente
   * era gia' a un rogito: la sovrapposizione la scopriva lui, aprendo il
   * telefono, con l'appuntamento gia' confermato al cliente.
   *
   * Un lead che ha gia' un appuntamento non riceve nuove proposte.
   */
  const availableSlots = lead.calendarSlotId
    ? []
    : await getBookableSlots(lead.organizationId);

  try {
    /*
     * L'immobile di cui il cliente sta chiedendo.
     *
     * Il collegamento e' gia' stato fatto al primo contatto se il messaggio
     * portava un riferimento riconoscibile — tipicamente il QR sul cartello.
     * Qui si leggono i dati veri e si mettono nel prompt: senza, l'assistente
     * rispondeva "un agente le fornira' i dettagli" a chi chiedeva il prezzo
     * di una casa che l'agenzia ha in catalogo, con la scheda a database.
     *
     * Una lettura in piu' per conversazione, e solo quando il collegamento
     * c'e': un lead senza immobile non paga nulla.
     */
    const property = lead.propertyId
      ? await prisma.property.findFirst({
          where: { id: lead.propertyId, organizationId: lead.organizationId },
          select: {
            reference: true,
            title: true,
            contract: true,
            type: true,
            comune: true,
            zona: true,
            priceEur: true,
            squareMeters: true,
            rooms: true,
            bathrooms: true,
            floor: true,
            energyClass: true,
            description: true,
          },
        })
      : null;

    const agentReply = await generateAgentReply({
      agencyName,
      clientName: lead.clientName,
      propertyRef: lead.propertyRef,
      history,
      availableSlots: availableSlots.map(formatSlotForChat),
      agencyProfile,
      ...(property
        ? {
            property: {
              ...property,
              // Etichette leggibili invece dei valori dell'enum: nel prompt
              // "VENDITA" e "APPARTAMENTO" sono gergo nostro, e il modello poi
              // li ripete al cliente cosi' come li legge.
              contract: CONTRACT_LABELS[property.contract],
              type: PROPERTY_TYPE_LABELS[property.type],
            },
          }
        : {}),
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
        /*
         * Preferenze di ricerca: `??` e non sovrascrittura secca.
         *
         * Il modello legge tutta la conversazione ma risponde sul turno
         * corrente: se il cliente ha nominato la zona all'inizio e non la
         * ripete più, i turni successivi restituiscono null. Con
         * un'assegnazione diretta ogni messaggio successivo cancellerebbe
         * ciò che era già stato raccolto, e la scheda si svuoterebbe da sola
         * mentre la conversazione prosegue.
         *
         * Un criterio si toglie solo a mano dalla scheda: lì è la decisione
         * di una persona, qui sarebbe un effetto collaterale.
         */
        preferredZone: agentReply.preferredZone ?? lead.preferredZone,
        preferredType: agentReply.preferredType ?? lead.preferredType,
        budgetMin: agentReply.budgetMinEur ?? lead.budgetMin,
        budgetMax: agentReply.budgetMaxEur ?? lead.budgetMax,
        minSquareMeters: agentReply.minSquareMeters ?? lead.minSquareMeters,

        /*
         * Ramo venditore, stessa regola del `??`.
         *
         * `intent` in particolare non torna mai indietro a null: il filtro di
         * pertinenza lo aveva già deciso sul primo messaggio, e un turno in
         * cui il modello non se ne occupa non deve cancellare quella
         * classificazione. Con essa sparirebbe il badge dalla scheda e il ramo
         * delle domande cambierebbe a metà conversazione.
         */
        intent: agentReply.leadIntent ?? lead.intent,
        // Email: si accetta solo qualcosa che assomigli a un indirizzo. Il
        // modello puo' restituire un frammento di frase, e un "mi scriva pure"
        // finito in questo campo diventa una conferma spedita nel vuoto.
        clientEmail:
          (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(agentReply.clientEmail.trim())
            ? agentReply.clientEmail.trim().toLowerCase()
            : null) ?? lead.clientEmail,
        sellerPropertyComune: vuotoComeNull(agentReply.sellerPropertyComune) ?? lead.sellerPropertyComune,
        sellerPropertyZona: vuotoComeNull(agentReply.sellerPropertyZona) ?? lead.sellerPropertyZona,
        sellerPropertyType: agentReply.sellerPropertyType ?? lead.sellerPropertyType,
        sellerPropertySquareMeters:
          agentReply.sellerPropertySquareMeters ?? lead.sellerPropertySquareMeters,
        sellerPropertyCondition:
          vuotoComeNull(agentReply.sellerPropertyCondition) ?? lead.sellerPropertyCondition,
        sellerTimeframe: vuotoComeNull(agentReply.sellerTimeframe) ?? lead.sellerTimeframe,
        sellerValuationInterest:
          agentReply.sellerValuationInterest ?? lead.sellerValuationInterest,

        qualificationStatus:
          agentReply.outcome === "CONTINUE" ? "IN_PROGRESS" : agentReply.outcome,
        ownedPropertiesCount,
        sellerCategory: deriveSellerCategory(ownedPropertiesCount),
      };
    }

    /*
     * Quale orario sta prenotando il cliente.
     *
     * Due strade, e la seconda è quella che mancava. La **scelta dall'elenco**
     * (`selectedSlotIndex`) copre chi risponde "il primo"; l'**orario proposto
     * da lui** (`proposedDateTime`) copre chi scrive "domani alle 11:40", che
     * è come parlano quasi tutti. Prima quel messaggio non prenotava niente
     * anche quando l'orario era libero, e la conversazione ripartiva
     * dall'elenco — con una persona che aveva appena detto quando poteva.
     *
     * Nessuna prenotazione da un messaggio fuori contesto: uno slot occupato
     * per una pubblicità è tempo dell'agente tolto a un cliente vero.
     */
    const oraProposta = parseProposedDateTime(agentReply.proposedDateTime);

    const chosen = agentReply.offTopic
      ? undefined
      : agentReply.selectedSlotIndex !== null
        ? availableSlots[agentReply.selectedSlotIndex - 1]
        : oraProposta
          ? (findSlotAt(availableSlots, oraProposta) ?? undefined)
          : undefined;

    /*
     * Ha chiesto un orario che non c'è.
     *
     * Il modello dovrebbe accorgersene da solo — l'elenco degli orari liberi
     * ce l'ha nel prompt — ma se sbaglia, questo è l'ultimo punto in cui la
     * cosa si può ancora fermare. Il messaggio viene riscritto qui, con gli
     * orari veri: confermare un appuntamento inesistente manda una persona
     * davanti a una porta chiusa, ed è un danno che nessun recupero ripara.
     */
    if (oraProposta && !chosen && agentReply.selectedSlotIndex === null && !agentReply.offTopic) {
      const vicini = nearestSlots(availableSlots, oraProposta, 3);

      replyText =
        vicini.length > 0
          ? `Mi dispiace, a quell'ora non abbiamo disponibilità. Le propongo questi orari: ${vicini
              .map(formatSlotForChat)
              .join("; ")}. Quale preferisce?`
          : "Mi dispiace, a quell'ora non abbiamo disponibilità. Un nostro agente la contatterà a breve per concordare un orario.";

      console.info("[WA-APPOINTMENT-UNAVAILABLE]", {
        leadId: lead.id,
        richiesto: oraProposta.toISOString(),
        alternativeProposte: vicini.length,
      });
    }

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
        /*
         * Il messaggio non puo' contraddire il calendario.
         *
         * Il modello scrive la risposta PRIMA che la prenotazione avvenga, e
         * su un orario proposto dal cliente puo' sbagliare valutazione: in
         * prova ha risposto "alle 11:40 non abbiamo disponibilita'" mentre
         * quell'orario cadeva dentro una fascia libera, che il sistema poi
         * prenotava. Il cliente avrebbe ricevuto un no con l'appuntamento
         * fissato: peggio di entrambi gli esiti presi da soli.
         *
         * Qui la verita' e' una sola ed e' il calendario. Si interviene pero'
         * SOLO quando il testo nega, per non sostituire con una frase
         * costruita una risposta gia' corretta e piu' naturale della nostra.
         */
        if (/non\s+(abbiamo|c'e|ci sono|risulta)|purtroppo|non disponibil/i.test(replyText)) {
          replyText = `Perfetto, le confermo l'appuntamento per ${formatSlotForChat(chosen)}. A presto.`;

          console.warn("[WA-APPOINTMENT-REPLY-OVERRIDE]", {
            leadId: lead.id,
            motivo: "il messaggio negava un orario che risultava libero",
          });
        }

        /*
         * Appuntamento fissato: lo stato della scheda lo dice.
         *
         * `appointmentSlot` porta la data dove la dashboard e la scheda la
         * leggono, e `dealStage` passa a VISIT_SCHEDULED. Senza, una visita
         * fissata dall'assistente restava visibile solo scorrendo la chat, e
         * l'agente la scopriva il giorno stesso — o non la scopriva.
         */
        leadUpdate = {
          ...leadUpdate,
          appointmentSlot: chosen.startTime,
          appointmentConfirmed: true,
          dealStage: "VISIT_SCHEDULED",
        };

        console.info("[WA-APPOINTMENT-BOOKED]", {
          leadId: lead.id,
          organizationId: lead.organizationId,
          quando: chosen.startTime.toISOString(),
          via: agentReply.selectedSlotIndex !== null ? "scelta-da-elenco" : "orario-proposto",
        });

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

    /*
     * Appuntamento appena fissato: partono le due conferme via email.
     *
     * # Perche' il confronto con lo stato precedente
     *
     * Perche' senza, ogni messaggio successivo di una conversazione che ha
     * gia' un appuntamento rispedirebbe le stesse due email. Chi le riceve
     * smette di leggerle, e il cliente si ritrova cinque conferme dello stesso
     * incontro. Si guarda la TRANSIZIONE, come per la consegna al gestionale.
     *
     * # Perche' qui e non dentro il ramo che prenota
     *
     * Perche' li' il messaggio WhatsApp non e' ancora partito. Il cliente
     * aspetta la conferma in chat: fargliela attendere per due invii di posta
     * significherebbe allungare l'unica risposta che sta guardando davvero.
     * Qui il messaggio e' gia' andato.
     *
     * Non blocca e non lancia: l'appuntamento e' gia' fissato e gia' scritto
     * sul calendario dell'agente, e una casella di posta che non risponde non
     * deve poter trasformare una visita concordata in un errore.
     */
    if (
      updated.dealStage === "VISIT_SCHEDULED" &&
      lead.dealStage !== "VISIT_SCHEDULED" &&
      updated.appointmentSlot !== null
    ) {
      await notifyAppointmentConfirmed(updated);
    }

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
      return;
    }

    /**
     * Preferenze cambiate a metà conversazione: si ricalcola subito.
     *
     * # Perché non basta più aspettare QUALIFIED
     *
     * Perché adesso i criteri arrivano molto prima della fine. Tipologia,
     * zona e budget sono le prime cose che l'assistente chiede, e il resto
     * della conversazione — mutuo, vendita, tempistiche — può durare giorni o
     * non concludersi mai. Aspettare la qualificazione per interrogare il
     * portafoglio significherebbe tenere l'agente all'oscuro di un immobile
     * compatibile che ha già in catalogo, proprio mentre la persona sta
     * ancora scrivendo.
     *
     * # Perché solo quando cambiano davvero
     *
     * Il confronto è coi valori precedenti, non con la presenza dei campi:
     * ogni turno della conversazione riscrive gli stessi criteri anche se non
     * si sono mossi, e senza questo controllo si rifarebbe una scansione
     * completa del portafoglio a ogni messaggio, per un risultato identico al
     * precedente.
     */
    const criteriCambiati =
      updated.preferredZone !== lead.preferredZone ||
      updated.preferredType !== lead.preferredType ||
      updated.budgetMin !== lead.budgetMin ||
      updated.budgetMax !== lead.budgetMax ||
      updated.minSquareMeters !== lead.minSquareMeters;

    if (criteriCambiati) {
      console.info("[WA-PREFERENCES-UPDATED]", {
        leadId: updated.id,
        organizationId: updated.organizationId,
        zona: updated.preferredZone,
        tipologia: updated.preferredType,
        budgetMin: updated.budgetMin,
        budgetMax: updated.budgetMax,
        mqMin: updated.minSquareMeters,
      });

      /*
       * Nessuna notifica qui, a differenza del ramo sopra.
       *
       * `notifyMatchesForLead` avvisa l'agente via email degli abbinamenti
       * forti. Su una conversazione ancora in corso i criteri si assestano
       * turno dopo turno: mandare un'email a ogni assestamento vorrebbe dire
       * tre messaggi per lo stesso contatto in cinque minuti, e chi li riceve
       * smette di leggerli. Gli abbinamenti restano visibili in scheda, e
       * l'email parte comunque quando il lead si qualifica.
       *
       * Non bloccante: la risposta al cliente è già partita, e un errore del
       * matching non deve trasformare una conversazione riuscita in un errore.
       */
      try {
        await runMatchingForLead(updated);
      } catch (error) {
        console.error("[whatsapp/conversation] Matching non riuscito", {
          leadId: updated.id,
          error,
        });
      }
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
