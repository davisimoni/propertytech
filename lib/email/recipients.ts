import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * A chi va una notifica di servizio dell'agenzia.
 *
 * # Solo inviti accettati
 *
 * `acceptedAt: null` significa che quell'indirizzo non ha ancora dimostrato di
 * appartenere a qualcuno: chi ha invitato ha digitato una email, e finché non
 * viene aperta quella email resta un'ipotesi. Mandarci crediti residui, stato
 * dell'abbonamento o nomi di clienti sarebbe spedire dati dell'agenzia a una
 * casella non verificata.
 */

export interface NotificationRecipient {
  email: string;
  firstName: string | null;
}

/** Titolare dell'agenzia: il destinatario delle notifiche di account e piano. */
export async function resolveOwner(organizationId: string): Promise<NotificationRecipient | null> {
  return prisma.user.findFirst({
    where: { organizationId, role: "OWNER", acceptedAt: { not: null } },
    select: { email: true, firstName: true },
    // Il più vecchio: è chi ha creato l'agenzia. Su un'agenzia con due
    // titolari, le comunicazioni di fatturazione devono avere un destinatario
    // stabile, non uno che cambia quando qualcuno viene promosso.
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Destinatario operativo di un lead: l'agente assegnato, altrimenti il
 * titolare.
 *
 * L'agente assegnato ha la precedenza perché è chi ha in carico quel contatto
 * e chi può agire subito; il titolare è il ripiego che c'è sempre.
 */
export async function resolveLeadOwner(
  organizationId: string,
  assignedToId: string | null
): Promise<NotificationRecipient | null> {
  if (assignedToId) {
    const assegnato = await prisma.user.findFirst({
      where: { id: assignedToId, organizationId, acceptedAt: { not: null } },
      select: { email: true, firstName: true },
    });
    if (assegnato) return assegnato;
  }

  return resolveOwner(organizationId);
}
