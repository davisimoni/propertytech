import "server-only";
import type { Lead } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appendMessage } from "./chat-history";

/**
 * Conteggio dei messaggi fuori contesto e sospensione automatica.
 *
 * # Perché la soglia è 2 e non 1
 *
 * Un singolo messaggio strano capita: un saluto isolato, una frase tagliata,
 * un vocale che il filtro non ha capito. Sospendere l'assistente al primo lo
 * spegnerebbe su conversazioni buone. Due di fila, invece, sono un segnale:
 * quel numero non sta parlando con l'agenzia.
 *
 * # Perché si conta la serie e non il totale
 *
 * Il contatore si azzera a **ogni** messaggio pertinente. Un cliente che
 * chiede casualmente qualcosa di estraneo in mezzo a una qualificazione non
 * deve avvicinarsi alla sospensione: quello che conta è una conversazione che
 * non riguarda l'agenzia, non un contatto che ogni tanto divaga.
 */

/** Messaggi consecutivi fuori contesto dopo i quali l'assistente si ferma. */
export const OFF_TOPIC_PAUSE_THRESHOLD = 2;

/**
 * Registra un messaggio fuori contesto e sospende l'assistente se serve.
 *
 * Il messaggio entra **sempre** in cronologia. L'assistente tace, ma l'agente
 * che apre la scheda deve vedere cosa è arrivato: senza, si troverebbe davanti
 * a una conversazione che si interrompe da sola e nessuna spiegazione.
 *
 * Restituisce `true` se l'assistente è stato sospeso adesso.
 */
export async function recordOffTopicMessage(
  lead: Lead,
  text: string,
  motivo: string
): Promise<boolean> {
  await appendMessage(lead.id, {
    sender: "user",
    text,
    timestamp: new Date().toISOString(),
  });

  const streak = lead.offTopicStreak + 1;
  const daSospendere = streak >= OFF_TOPIC_PAUSE_THRESHOLD && lead.aiEnabled;

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      offTopicStreak: streak,
      // `aiEnabled` si tocca solo per spegnerlo: se l'agente l'ha già
      // riacceso a mano, questo contatore non deve rispegnerlo alle sue
      // spalle. Per questo la condizione include `lead.aiEnabled`.
      ...(daSospendere ? { aiEnabled: false } : {}),
    },
  });

  console.info("[WA-OFF-TOPIC]", {
    leadId: lead.id,
    organizationId: lead.organizationId,
    streak,
    motivo,
    sospeso: daSospendere,
  });

  return daSospendere;
}

/**
 * Azzera la serie dopo un messaggio pertinente.
 *
 * Scrive solo se c'è qualcosa da azzerare: la stragrande maggioranza dei
 * messaggi è pertinente su un contatore già a zero, e una UPDATE per ognuno
 * sarebbe una scrittura inutile su ogni messaggio della piattaforma.
 */
export async function resetOffTopicStreak(lead: Lead): Promise<void> {
  if (lead.offTopicStreak === 0) return;

  await prisma.lead.update({
    where: { id: lead.id },
    data: { offTopicStreak: 0 },
  });
}
