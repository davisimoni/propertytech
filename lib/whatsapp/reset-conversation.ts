import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Azzeramento di una conversazione, dal comando `!reset`.
 *
 * # A cosa serve
 *
 * Riprovare il flusso di qualificazione dall'inizio sullo stesso numero. Senza,
 * il secondo collaudo parte da una scheda che porta già le risposte del primo,
 * e l'assistente salta le domande: si finisce per provare un percorso diverso
 * da quello che vedrà un cliente vero.
 *
 * # Perché cancella invece di riportare lo stato a PENDING
 *
 * Un reset che lasciasse la scheda in piedi conserverebbe cronologia, campi
 * estratti, abbinamenti già calcolati e promemoria già inviati: il collaudo
 * successivo ripartirebbe da uno stato che non assomiglia a quello di un
 * contatto nuovo. Se si azzera, si azzera davvero.
 *
 * # Lo slot d'agenda va liberato a mano
 *
 * Il vincolo fra `Lead` e `CalendarSlot` è `SetNull`: cancellando la scheda, il
 * riferimento sparisce ma `isBooked` resterebbe `true`. Sarebbe uno slot
 * occupato da un appuntamento che non esiste più, invisibile e irrecuperabile
 * se non da database. Le due operazioni stanno quindi nella stessa transazione:
 * o si libera l'agenda e si cancella la scheda, o non succede nulla.
 */
export interface ResetOutcome {
  /** Vero se esisteva qualcosa da azzerare. */
  hadLead: boolean;
  /** Vero se un appuntamento è stato liberato. */
  freedSlot: boolean;
}

export async function resetConversation(
  organizationId: string,
  clientPhone: string,
  chatJid?: string | null
): Promise<ResetOutcome> {
  const lead =
    (chatJid
      ? await prisma.lead.findFirst({
          where: { organizationId, waChatJid: chatJid },
          select: { id: true, calendarSlotId: true },
        })
      : null) ??
    (await prisma.lead.findUnique({
      where: { organizationId_clientPhone: { organizationId, clientPhone } },
      select: { id: true, calendarSlotId: true },
    }));

  // Il silenzio si toglie in ogni caso: `!reset` su una chat silenziata deve
  // riportarla allo stato di partenza, non lasciarla muta a metà.
  await prisma.whatsAppMutedContact.deleteMany({ where: { organizationId, clientPhone } });

  if (!lead) return { hadLead: false, freedSlot: false };

  await prisma.$transaction(async (tx) => {
    if (lead.calendarSlotId) {
      await tx.calendarSlot.update({
        where: { id: lead.calendarSlotId },
        data: { isBooked: false },
      });
    }

    // Cronologia, abbinamenti e match di portafoglio se ne vanno in cascata:
    // tutte le relazioni verso `Lead` sono dichiarate `Cascade` o `SetNull`.
    await tx.lead.delete({ where: { id: lead.id } });
  });

  return { hadLead: true, freedSlot: Boolean(lead.calendarSlotId) };
}
