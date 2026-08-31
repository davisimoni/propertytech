import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Numeri su cui l'assistente non interviene.
 *
 * # Perché non basta `Lead.aiEnabled`
 *
 * `!pausa` spegne l'assistente su una **scheda**. Va bene per una trattativa
 * che si fa delicata, ma non copre il caso che l'agente incontra più spesso:
 * la chat personale, il fornitore, il collega. Lì una scheda non c'è, e non
 * deve nascere — creare un lead per poterlo zittire sporcherebbe la pipeline
 * con contatti che nessuno ha chiesto di qualificare, e li conterebbe fra i
 * numeri dell'agenzia.
 *
 * Questo elenco vive accanto alle schede, non dentro: è un elenco di numeri.
 *
 * # Perché il silenzio non scade
 *
 * Un contatto silenziato resta silenziato finché qualcuno non lo riattiva con
 * `!riprendi`. Una scadenza automatica significherebbe che un giorno,
 * senza che nessuno abbia deciso niente, l'assistente ricomincia a scrivere
 * alla moglie dell'agente: è il tipo di sorpresa che fa staccare l'integrazione
 * invece di farla configurare meglio.
 */

/** Vero se l'assistente deve restare zitto con questo numero. */
export async function isMutedContact(
  organizationId: string,
  clientPhone: string
): Promise<boolean> {
  const riga = await prisma.whatsAppMutedContact.findUnique({
    where: { organizationId_clientPhone: { organizationId, clientPhone } },
    select: { id: true },
  });
  return riga !== null;
}

/**
 * Silenzia un numero. Idempotente: ripetere `!pausa` non è un errore.
 *
 * `upsert` e non `create`: l'agente che scrive `!pausa` due volte sta
 * confermando una decisione, non provocando un guasto.
 */
export async function muteContact(
  organizationId: string,
  clientPhone: string,
  reason = "comando_agente"
): Promise<void> {
  await prisma.whatsAppMutedContact.upsert({
    where: { organizationId_clientPhone: { organizationId, clientPhone } },
    create: { organizationId, clientPhone, reason },
    // Il motivo non si sovrascrive: se il filtro automatico aveva già
    // silenziato il numero, sapere che poi è arrivata anche la conferma
    // dell'agente non cambia nulla di utile.
    update: {},
  });
}

/** Riattiva l'assistente su un numero. Silenzioso se non era silenziato. */
export async function unmuteContact(
  organizationId: string,
  clientPhone: string
): Promise<void> {
  await prisma.whatsAppMutedContact.deleteMany({
    where: { organizationId, clientPhone },
  });
}
