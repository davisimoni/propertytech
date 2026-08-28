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
 *
 * # Perché una query grezza e non un `upsert`
 *
 * La versione precedente leggeva la cronologia, ci aggiungeva il messaggio in
 * memoria e riscriveva l'array intero. È il classico *lost update*: due
 * messaggi ravvicinati arrivano come due richieste HTTP separate, che su
 * Vercel girano in istanze diverse e in parallelo. Entrambe leggono la stessa
 * cronologia di partenza, entrambe riscrivono, e **l'ultima cancella il
 * messaggio dell'altra**.
 *
 * Non è un caso di laboratorio: su WhatsApp scrivere due messaggi di fila
 * ("Buonasera" / "cerco un trilocale") è il comportamento normale. Il
 * risultato era una qualificazione condotta su metà di quello che il cliente
 * aveva scritto, senza un errore da nessuna parte che lo segnalasse.
 *
 * `jsonb || jsonb` concatena lato database dentro una sola istruzione:
 * l'append diventa atomico e la finestra fra lettura e scrittura sparisce.
 * `ON CONFLICT` copre la prima scrittura, quando la riga non esiste ancora.
 */
export async function appendMessage(
  leadId: string,
  message: ChatMessage
): Promise<ChatMessage[]> {
  const payload = JSON.stringify([message]);

  const rows = await prisma.$queryRaw<{ messages: unknown }[]>`
    INSERT INTO "WhatsAppChat" ("id", "leadId", "messages", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, ${leadId}, ${payload}::jsonb, NOW(), NOW())
    ON CONFLICT ("leadId") DO UPDATE
      SET "messages" = "WhatsAppChat"."messages" || ${payload}::jsonb,
          "updatedAt" = NOW()
    RETURNING "messages"
  `;

  // `RETURNING` restituisce la cronologia già comprensiva di questo messaggio:
  // chi chiama non deve rileggerla, e non può ottenerne una versione diversa
  // da quella appena scritta.
  return parseChatMessages(rows[0]?.messages ?? null);
}
