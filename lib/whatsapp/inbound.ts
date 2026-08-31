import "server-only";
import type { Organization, WhatsAppConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone, parseChatMessages } from "./types";
import { isOptOutMessage } from "./compliance";
import { handleClosedConversation, handleIncomingMessage, handleOptOut } from "./conversation";
import { applyReminderReply, isAwaitingReminderReply, parseReminderReply } from "./reminders";
import { createLeadFromFirstMessage } from "./first-contact";
import { classifyIntent } from "@/lib/ai/intent-gateway";
import { recordOffTopicMessage, resetOffTopicStreak } from "./off-topic";
import { AGENT_COMMAND_REPLIES, parseAgentCommand } from "./agent-commands";
import { sendWhatsAppMessageForProvider } from "./client";
import { resolveWhatsAppCredentials } from "./credentials";
import { recordClientMessage } from "./conversation";
import type { InboundWhatsAppMessage } from "./provider";
import { countInvisibleChars, sanitizeInboundText } from "./sanitize";
import { isMutedContact, muteContact, unmuteContact } from "./muted-contacts";
import { resetConversation } from "./reset-conversation";

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

  /*
   * Comando su una chat che non ha una scheda.
   *
   * E' il caso piu' frequente per cui un agente scrive `!pausa`: la chat
   * personale, il fornitore, il collega. Prima si usciva con un avviso nei
   * log e senza fare nulla, quindi il comando sembrava ignorato — e a chi
   * l'ha scritto restava il dubbio se l'assistente avrebbe risposto o no.
   *
   * Il numero finisce nell'elenco dei silenziati, che non richiede una
   * scheda. Non se ne crea una apposta: una scheda esiste per qualificare
   * qualcuno, e aprirne una per poterla zittire conterebbe fra i lead
   * dell'agenzia un contatto che nessuno ha chiesto di qualificare.
   */
  if (!lead) {
    if (command === "reset") {
      // Nessuna scheda da cancellare, ma il silenzio va tolto lo stesso: dopo
      // un `!reset` il contatto deve essere nello stato in cui era prima che
      // qualcuno lo toccasse.
      await resetConversation(config.organizationId, clientPhone, message.chatJid);
      console.info("[WA-RESET] Nessuna scheda da azzerare", {
        organizationId: config.organizationId,
      });
    } else if (command === "pause_ai" || command === "resume_ai") {
      if (command === "pause_ai") {
        await muteContact(config.organizationId, clientPhone, "comando_agente");
      } else {
        await unmuteContact(config.organizationId, clientPhone);
      }

      console.info("[WA-AGENT-COMMAND] Chat senza scheda", {
        organizationId: config.organizationId,
        command,
        from: `${clientPhone.slice(0, 6)}…`,
      });
    } else {
      console.info("[WA-AGENT-COMMAND] Richiesta di aiuto su chat senza scheda", {
        organizationId: config.organizationId,
      });
    }

    // La conferma parte comunque: e' l'unico modo che l'agente ha di sapere
    // che il comando e' stato capito.
    try {
      await sendWhatsAppMessageForProvider(
        resolveWhatsAppCredentials(config),
        clientPhone,
        AGENT_COMMAND_REPLIES[command],
        message.chatJid
      );
    } catch (error) {
      console.error("[WA-AGENT-COMMAND] Conferma non inviata (chat senza scheda)", { error });
    }
    return;
  }

  if (command === "reset") {
    /*
     * Recapito catturato PRIMA della cancellazione: subito dopo la scheda non
     * esiste piu' e non c'e' da dove leggere numero e indirizzo di chat a cui
     * mandare la conferma.
     */
    const destinatario = { phone: lead.clientPhone, jid: lead.waChatJid ?? message.chatJid };
    const esito = await resetConversation(config.organizationId, clientPhone, message.chatJid);

    console.warn("[WA-RESET] Conversazione azzerata", {
      leadId: lead.id,
      organizationId: config.organizationId,
      appuntamentoLiberato: esito.freedSlot,
    });

    try {
      await sendWhatsAppMessageForProvider(
        resolveWhatsAppCredentials(config),
        destinatario.phone,
        AGENT_COMMAND_REPLIES.reset,
        destinatario.jid
      );
    } catch (error) {
      console.error("[WA-RESET] Conferma non inviata", { error });
    }
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
  rawMessage: InboundWhatsAppMessage
): Promise<void> {
  /**
   * Ripulitura prima di ogni altra cosa.
   *
   * Qui e non nelle quattro rotte di trasporto: la regola vale per Meta, QR,
   * Twilio e webhook generico allo stesso modo, e quattro copie diventerebbero
   * quattro versioni diverse al primo ritocco. Da questo punto in avanti il
   * resto della funzione lavora sul testo pulito senza sapere che esiste una
   * ripulitura.
   */
  const invisibili = countInvisibleChars(rawMessage.text);
  const message: InboundWhatsAppMessage = {
    ...rawMessage,
    text: sanitizeInboundText(rawMessage.text),
  };

  const clientPhone = normalizePhone(message.fromPhone);

  console.info("[WA-INBOUND-MESSAGE]", {
    organizationId: config.organizationId,
    provider: config.provider,
    // Numero troncato: nei log resta abbastanza per riconoscere una
    // conversazione senza conservare per intero il recapito di una persona
    // che ha solo chiesto informazioni su una casa (CLAUDE.md §5).
    from: `${clientPhone.slice(0, 6)}…`,
    chars: message.text.length,
    // Utili a distinguere un messaggio scritto a mano da uno incollato da
    // un'email di portale, quando si indaga su un lead che non e' comparso.
    charsGrezzi: rawMessage.text.length,
    invisibili,
    righe: message.text.split("\n").length,
  });

  /*
   * Un messaggio fatto di soli caratteri invisibili arriva vuoto qui.
   *
   * Prima della ripulitura passava i controlli, perche' `trim()` non rimuove
   * U+200B: apriva una scheda senza contenuto e mandava l'assistente a
   * qualificare il nulla. Fermarlo qui, con un log, e' diverso da lasciarlo
   * cadere in silenzio: se ricapita si vede.
   */
  if (!message.text.trim()) {
    console.warn("[WA-INBOUND-EMPTY] Messaggio vuoto dopo la ripulitura, ignorato", {
      organizationId: config.organizationId,
      charsGrezzi: rawMessage.text.length,
      invisibili,
    });
    return;
  }

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

  /*
   * Numero silenziato: nessuna risposta, nessuna scheda, nessun credito.
   *
   * Il controllo sta **dopo** i comandi dell'agente, cosi' `!riprendi` puo'
   * ancora arrivare su una chat silenziata: un silenzio da cui non si torna
   * indietro sarebbe una trappola. Sta **prima** di tutto il resto perche' la
   * decisione e' gia' stata presa da una persona e non c'e' nulla da valutare.
   */
  if (await isMutedContact(config.organizationId, clientPhone)) {
    console.info("[WA-MUTED] Contatto silenziato, nessuna risposta", {
      organizationId: config.organizationId,
      from: `${clientPhone.slice(0, 6)}…`,
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
    /**
     * Anche il primo contatto passa dal filtro.
     *
     * Senza, un numero sbagliato o un fornitore riceverebbero l'apertura
     * completa della qualificazione - informativa privacy inclusa - e
     * lascerebbero in pipeline una scheda che nessuno ha chiesto. Qui non
     * c'e' ancora un lead, quindi non c'e' nulla da contare: il messaggio
     * viene semplicemente ignorato.
     *
     * Il classificatore ha istruzione esplicita di considerare pertinente
     * qualunque apertura generica ("Buongiorno", "Ho visto l'annuncio"): e'
     * proprio qui che un falso negativo costerebbe un cliente vero.
     */
    const verdetto = await classifyIntent({ message: message.text });

    if (!verdetto.pertinente) {
      console.info("[WA-OFF-TOPIC] Primo contatto ignorato", {
        organizationId: config.organizationId,
        motivo: verdetto.motivo,
      });
      return;
    }

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
      /**
       * Qualificazione conclusa: di regola il ciclo si ferma qui, perche'
       * rifarlo girare a ogni frase potrebbe ribaltare un esito gia'
       * raggiunto e gia' consegnato al gestionale.
       *
       * L'eccezione e' la persona che torna **mesi dopo con un'altra
       * richiesta**. Prima finiva contro questo muro: riceveva una volta il
       * messaggio di chiusura e da li' in poi il silenzio, perche'
       * `handleClosedConversation` non risponde due volte di seguito la stessa
       * cosa. Una richiesta nuova da un contatto che l'agenzia ha gia' servito
       * e' fra i lead piu' facili da chiudere, e restava senza risposta senza
       * che nessuno se ne accorgesse.
       *
       * La soglia per riaprire e' `nuovaRichiesta`, non la sola pertinenza: un
       * "grazie mille" o un "a presto" sono pertinenti e non devono far
       * ripartire nulla. Il classificatore ha istruzione di stare basso e di
       * scegliere `false` nel dubbio.
       */
      const storicoChiuso = parseChatMessages(
        (await prisma.whatsAppChat.findUnique({
          where: { leadId: lead.id },
          select: { messages: true },
        }))?.messages
      );

      const verdettoChiuso = await classifyIntent({
        message: message.text,
        recentContext: storicoChiuso
          .slice(-4)
          .map((m) => `${m.sender === "bot" ? "Agenzia" : "Cliente"}: ${m.text}`),
      });

      if (verdettoChiuso.pertinente && verdettoChiuso.nuovaRichiesta) {
        /*
         * Si riapre lo stato, non si cancellano i dati.
         *
         * Mutuo, tempistiche e budget raccolti la volta scorsa restano: sono
         * fatti su quella persona, non su quella pratica, e buttarli
         * significherebbe rifare domande a cui ha gia' risposto. Se nel
         * frattempo sono cambiati, e' la conversazione stessa ad aggiornarli.
         */
        const riaperto = await prisma.lead.update({
          where: { id: lead.id },
          data: { qualificationStatus: "IN_PROGRESS" },
        });

        console.info("[WA-LEAD-REOPENED]", {
          leadId: lead.id,
          organizationId: config.organizationId,
          statoPrecedente: lead.qualificationStatus,
          motivo: verdettoChiuso.motivo,
        });

        await resetOffTopicStreak(riaperto);
        await handleIncomingMessage(
          riaperto,
          config,
          config.organization.agencyName,
          message.text,
          config.organization
        );
      } else {
        await handleClosedConversation(lead, config, message.text);
      }
    } else {
      /**
       * Filtro di pertinenza, davanti all'agente di qualificazione.
       *
       * Sta QUI e non prima, di proposito: opt-out, risposte ai promemoria e
       * conversazioni gia' prese in carico da una persona non devono
       * dipendere da un giudizio del modello. Un "STOP" resta un opt-out
       * anche se un classificatore lo trovasse poco pertinente.
       *
       * La cronologia recente viaggia col messaggio perche' senza contesto un
       * "si" o un "200 mila" sembrano frasi a caso, mentre sono la risposta
       * alla domanda che l'assistente ha appena fatto.
       */
      const storico = parseChatMessages(
        (await prisma.whatsAppChat.findUnique({
          where: { leadId: lead.id },
          select: { messages: true },
        }))?.messages
      );

      const verdetto = await classifyIntent({
        message: message.text,
        recentContext: storico
          .slice(-4)
          .map((m) => `${m.sender === "bot" ? "Agenzia" : "Cliente"}: ${m.text}`),
      });

      if (!verdetto.pertinente) {
        // Nessuna risposta: e' il punto della funzione. Il messaggio resta in
        // cronologia e il contatore avanza; alla soglia l'assistente si
        // sospende da solo su questo contatto.
        const sospeso = await recordOffTopicMessage(lead, message.text, verdetto.motivo);
        if (sospeso) {
          console.info("[WA-AI-AUTOPAUSED]", {
            leadId: lead.id,
            organizationId: config.organizationId,
            motivo: verdetto.motivo,
          });
        }
        return;
      }

      // Pertinente: la serie si interrompe qui.
      await resetOffTopicStreak(lead);

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
