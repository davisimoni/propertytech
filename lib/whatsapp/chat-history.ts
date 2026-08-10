import "server-only";
import { prisma } from "@/lib/prisma";
import { parseChatMessages, type ChatMessage } from "./types";

/**
 * Appende un messaggio alla cronologia del lead e restituisce la lista
 * aggiornata.
 *
 * Vive in un modulo proprio perché ci scrivono sia il flusso di qualificazione
 * sia i promemoria anti no-show: la chat che l'agente legge deve contenere
 * tutto ciò che è stato scambiato con il cliente, non solo la parte gestita
 * dall'AI.
 */
export async function appendMessage(
  leadId: string,
  message: ChatMessage
): Promise<ChatMessage[]> {
  const chat = await prisma.whatsAppChat.findUnique({ where: { leadId } });
  const history = [...parseChatMessages(chat?.messages), message];

  await prisma.whatsAppChat.upsert({
    where: { leadId },
    create: { leadId, messages: history },
    update: { messages: history },
  });

  return history;
}
