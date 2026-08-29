import "server-only";
import { prisma } from "@/lib/prisma";
import { PLANS, type PlanId } from "@/lib/plans";
import { resolveOwner } from "@/lib/email/recipients";
import {
  sendCreditsExhaustedEmail,
  sendCreditsWarningEmail,
  type CreditKind,
} from "@/lib/email/transactional";

/**
 * Avvisi di crediti in esaurimento.
 *
 * # Perché serve una memoria
 *
 * Superata la soglia dell'80%, ogni messaggio successivo la supera di nuovo.
 * Senza tenere traccia di cosa è già stato spedito, un'agenzia attiva
 * riceverebbe la stessa email decine di volte in un pomeriggio — e la
 * cancellerebbe senza leggerla proprio quando arriva quella del 100%.
 *
 * `*NotifiedPct` sul contatore registra la soglia più alta già annunciata.
 * Si invia solo quando se ne supera una **nuova**, e il valore si azzera al
 * rinnovo del periodo insieme ai contatori.
 *
 * # Perché il controllo sta dopo il consumo
 *
 * Il gate che blocca (`checkUsageLimit`) viene prima dell'azione ed è
 * fail-closed. Questo avviso viene dopo, e non deve poter impedire nulla: se
 * fallisce, il credito è già stato consumato correttamente e l'agenzia non se
 * ne accorge.
 */

const SOGLIE = [90, 80] as const;

const CAMPO_CONTATORE = {
  whatsapp: "whatsappCreditsUsed",
  documents: "docCreditsUsed",
  voice: "voiceCreditsUsed",
} as const;

const CAMPO_NOTIFICA = {
  whatsapp: "whatsappNotifiedPct",
  documents: "docNotifiedPct",
  voice: "voiceNotifiedPct",
} as const;

const CAMPO_LIMITE = {
  whatsapp: "waConversationsLimit",
  documents: "ocrDocumentsLimit",
  voice: "voiceReportsLimit",
} as const;

/**
 * Controlla le soglie dopo un consumo e avvisa se serve. Non lancia mai.
 *
 * Restituisce la soglia annunciata, o `null` se non c'era nulla da dire.
 */
export async function checkCreditThresholds(
  organizationId: string,
  kind: CreditKind
): Promise<number | null> {
  try {
    const [tracker, subscription] = await Promise.all([
      prisma.usageTracker.findUnique({
        where: { organizationId },
        select: {
          whatsappCreditsUsed: true,
          docCreditsUsed: true,
          voiceCreditsUsed: true,
          whatsappNotifiedPct: true,
          docNotifiedPct: true,
          voiceNotifiedPct: true,
        },
      }),
      prisma.subscription.findUnique({
        where: { organizationId },
        select: { status: true },
      }),
    ]);

    if (!tracker) return null;

    const plan = PLANS[(subscription?.status ?? "trial") as PlanId];
    const limite = plan[CAMPO_LIMITE[kind]];

    // `null` significa illimitato: non esiste una percentuale di infinito.
    if (limite === null || limite <= 0) return null;

    const usati = tracker[CAMPO_CONTATORE[kind]];
    const giaAnnunciata = tracker[CAMPO_NOTIFICA[kind]];
    const percentuale = Math.floor((usati / limite) * 100);

    // Dalla più alta: chi passa dal 75% al 100% con un'operazione sola deve
    // ricevere l'avviso di blocco, non quello dell'80% che è già superato.
    const soglia =
      percentuale >= 100 ? 100 : SOGLIE.find((s) => percentuale >= s && s > giaAnnunciata) ?? null;

    if (soglia === null || soglia <= giaAnnunciata) return null;

    const owner = await resolveOwner(organizationId);
    if (!owner) return null;

    // La memoria si scrive PRIMA dell'invio: due consumi ravvicinati arrivano
    // come richieste parallele, e aggiornare dopo lascerebbe entrambe convinte
    // di dover spedire.
    await prisma.usageTracker.update({
      where: { organizationId },
      data: { [CAMPO_NOTIFICA[kind]]: soglia },
    });

    const outcome =
      soglia === 100
        ? await sendCreditsExhaustedEmail({
            to: owner.email,
            firstName: owner.firstName,
            kind,
            limit: limite,
          })
        : await sendCreditsWarningEmail({
            to: owner.email,
            firstName: owner.firstName,
            kind,
            used: usati,
            limit: limite,
            percent: soglia as 80 | 90,
          });

    console.info("[CREDITS-THRESHOLD]", { organizationId, kind, soglia, outcome });
    return soglia;
  } catch (error) {
    console.error("[notifications/credit-thresholds] Controllo non riuscito", {
      organizationId,
      kind,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}
