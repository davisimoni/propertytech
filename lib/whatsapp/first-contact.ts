import "server-only";
import type { Lead, LeadIntent, WhatsAppConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkUsageLimit } from "@/lib/usage";
import { initialDealStage } from "@/lib/leads/deal-stage";
import { normalizePhone } from "./types";
import { startConversation } from "./conversation";
import { resolvePropertyFromText } from "@/lib/leads/resolve-property";
import { appendMessage } from "./chat-history";

/**
 * Primo messaggio da un numero non ancora in archivio.
 *
 * Fino a ora un messaggio del genere veniva scartato: l'unico modo di entrare
 * in pipeline era il webhook dei portali. Con il QR in vetrina è invece il
 * percorso principale — la persona inquadra il codice e scrive per prima — e
 * senza questa funzione ogni scansione finirebbe nel vuoto.
 */

/** Nome usato quando WhatsApp non espone quello del profilo. */
const FALLBACK_NAME = "Contatto WhatsApp";

/** Quanto testo del primo messaggio finisce nel riferimento immobile. */
const MAX_REF_LENGTH = 120;

/**
 * Ricava il riferimento immobile dal primo messaggio.
 *
 * È ciò che la persona ha scritto inquadrando il cartello, quindi contiene
 * quasi sempre il riferimento dell'immobile o l'indirizzo: molto più utile di
 * un'etichetta fissa uguale per tutti.
 */
export function propertyRefFromMessage(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "Richiesta da QR Code";

  return clean.length <= MAX_REF_LENGTH ? clean : `${clean.slice(0, MAX_REF_LENGTH - 1)}…`;
}

/** Nome del contatto: profilo WhatsApp se disponibile, altrimenti segnaposto. */
export function resolveContactName(profileName: string | undefined): string {
  const clean = profileName?.replace(/\s+/g, " ").trim();
  return clean && clean.length > 0 ? clean.slice(0, 120) : FALLBACK_NAME;
}

/**
 * Crea la scheda per un contatto sconosciuto e avvia la qualificazione.
 *
 * Restituisce il lead creato, oppure `null` se non è stato possibile
 * ingaggiarlo. Il lead resta comunque salvato anche quando i crediti sono
 * esauriti: l'agenzia lo trova in pipeline come `PENDING` e lo recupera dopo
 * l'upgrade, invece di perdere un contatto che si è mosso da solo.
 */
export async function createLeadFromFirstMessage(params: {
  config: WhatsAppConfig;
  agencyName: string;
  fromPhone: string;
  profileName?: string;
  messageText: string;
  chatJid?: string;
  /** Comprare o vendere, dal filtro di pertinenza. `null` se non e' chiaro. */
  intent?: LeadIntent | null;
}): Promise<Lead | null> {
  const { config, agencyName, fromPhone, profileName, messageText, chatJid, intent } = params;
  const organizationId = config.organizationId;
  const clientPhone = normalizePhone(fromPhone);

  const lead = await prisma.lead.create({
    data: {
      organizationId,
      clientName: resolveContactName(profileName),
      clientPhone,
      // Indirizzo esatto della chat: senza, la risposta verrebbe spedita a un
      // indirizzo ricostruito dalle cifre, che con un LID non esiste.
      waChatJid: chatJid ?? null,
      portalSource: "QR_CODE",
      propertyRef: propertyRefFromMessage(messageText),
      qualificationStatus: "PENDING",
      dealStage: initialDealStage("PENDING"),
      // Deciso dal filtro di pertinenza sul primo messaggio: e' l'unico
      // momento in cui si puo' ancora scegliere come aprire la conversazione.
      intent: intent ?? null,
      /*
       * L'immobile riconosciuto dal messaggio, gia' alla creazione.
       *
       * Prima il collegamento avveniva solo a qualificazione conclusa
       * (`linkLeadToProperty` in conversation.ts): utile per la scheda, inutile
       * per la conversazione. Chi inquadra il QR sul cartello di una casa
       * scrive "[Rif: A102]" nel primo messaggio, e l'assistente rispondeva
       * senza sapere di quale casa si trattasse — chiedendo un'informazione che
       * la persona aveva gia' dato.
       *
       * Il riconoscimento e' lo stesso di prima e resta severo: si collega solo
       * su una corrispondenza inequivocabile, perche' un lead attribuito
       * all'immobile sbagliato inquina il bilancio che va al proprietario.
       */
      propertyId: await resolvePropertyFromText(organizationId, messageText),
    },
  });

  // Il messaggio con cui il cliente ha aperto la conversazione entra in
  // cronologia prima dell'ingaggio.
  //
  // Finiva solo dentro `propertyRef`, quindi il cassetto mostrava la risposta
  // dell'assistente senza la domanda che l'aveva provocata: una conversazione
  // che comincia dalla seconda battuta. `appendMessage` fa upsert, quindi puo'
  // creare la cronologia prima che l'AI scriva.
  try {
    await appendMessage(lead.id, {
      sender: "user",
      text: messageText,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Non blocca l'ingaggio: meglio una cronologia incompleta che un lead mai
    // contattato.
    console.error("[whatsapp/first-contact] Primo messaggio non registrato", {
      leadId: lead.id,
      error,
    });
  }

  // Crediti verificati dopo la creazione, come nel percorso dei portali: il
  // contatto non va perso perché il piano è esaurito.
  const limitResponse = await checkUsageLimit(organizationId, "whatsapp");
  if (limitResponse) {
    console.warn("[whatsapp/first-contact] Crediti esauriti, lead lasciato in attesa", {
      leadId: lead.id,
    });
    return lead;
  }

  try {
    await startConversation(lead, config, agencyName);
  } catch (error) {
    console.error("[whatsapp/first-contact] Ingaggio non riuscito", { leadId: lead.id, error });
  }

  return lead;
}
