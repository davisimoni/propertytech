import "server-only";
import { prisma } from "@/lib/prisma";
import { ENTERPRISE_OVERAGE_PRICE_EUR, formatEurCents, PLANS, type PlanId } from "@/lib/plans";
import { isOverageBillingActive } from "@/lib/billing/overage";
import { resolveOwner } from "@/lib/email/recipients";
import {
  CREDIT_LABELS,
  sendCreditsExhaustedEmail,
  sendCreditsWarningEmail,
  sendOverageStartedEmail,
  type CreditKind,
} from "@/lib/email/transactional";
import {
  pushCreditiAllOttantaPercento,
  pushCreditiEsauriti,
  pushTariffazioneAConsumo,
} from "@/lib/push/messages";
import { inviaPushAUtenti } from "@/lib/push/send";

/**
 * Avvisi di crediti operativi in esaurimento: 80% e 100%.
 *
 * # Perché due soglie e non tre
 *
 * L'80% lascia margine per acquistare un pacchetto o cambiare piano; il 100%
 * dice che la funzione si è fermata. Un avviso intermedio al 90% ripeteva il
 * primo senza aggiungere un'azione diversa, e ogni email di sistema in più
 * abitua a ignorare le successive.
 *
 * # Perché la dotazione comprende i pacchetti
 *
 * Per le conversazioni WhatsApp la dotazione è quella del piano **più** i
 * crediti acquistati (`bonusWhatsappCredits`), come per il gate. Calcolata sul
 * solo piano, un'agenzia che ha appena comprato cento conversazioni riceveva
 * "crediti esauriti" mentre ne aveva ancora cento.
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

const SOGLIE = [80] as const;

const CAMPO_CONTATORE = {
  whatsapp: "whatsappCreditsUsed",
  documents: "docCreditsUsed",
  voice: "voiceCreditsUsed",
  radar: "radarCreditsUsed",
} as const;

const CAMPO_NOTIFICA = {
  whatsapp: "whatsappNotifiedPct",
  documents: "docNotifiedPct",
  voice: "voiceNotifiedPct",
  radar: "radarNotifiedPct",
} as const;

const CAMPO_LIMITE = {
  whatsapp: "waConversationsLimit",
  documents: "ocrDocumentsLimit",
  voice: "voiceReportsLimit",
  radar: "radarAppraisalsLimit",
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
    const [tracker, subscription, organization] = await Promise.all([
      prisma.usageTracker.findUnique({
        where: { organizationId },
        select: {
          whatsappCreditsUsed: true,
          docCreditsUsed: true,
          voiceCreditsUsed: true,
          radarCreditsUsed: true,
          whatsappNotifiedPct: true,
          docNotifiedPct: true,
          voiceNotifiedPct: true,
          radarNotifiedPct: true,
        },
      }),
      prisma.subscription.findUnique({
        where: { organizationId },
        select: { status: true, stripeCustomerId: true, stripeOverageItemId: true },
      }),
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { bonusWhatsappCredits: true },
      }),
    ]);

    if (!tracker) return null;

    // Enterprise a consumo: stesse soglie, testo diverso. "L'assistente smette
    // di rispondere" sarebbe falso, e "da qui si paga" è ciò che serve sapere.
    const aConsumo =
      kind === "whatsapp" && isOverageBillingActive(subscription)
        ? { prezzoUnitario: formatEurCents(ENTERPRISE_OVERAGE_PRICE_EUR) }
        : undefined;

    const plan = PLANS[(subscription?.status ?? "trial") as PlanId];
    const limitePiano = plan[CAMPO_LIMITE[kind]];

    // `null` significa illimitato: non esiste una percentuale di infinito.
    if (limitePiano === null || limitePiano <= 0) return null;

    const limite =
      kind === "whatsapp" ? limitePiano + (organization?.bonusWhatsappCredits ?? 0) : limitePiano;

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
        ? aConsumo
          ? await sendOverageStartedEmail({
              to: owner.email,
              firstName: owner.firstName,
              limit: limite,
              prezzoUnitario: aConsumo.prezzoUnitario,
            })
          : await sendCreditsExhaustedEmail({
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
            aConsumo,
          });

    // Stessa soglia, anche sui dispositivi del titolare. Non lancia.
    const push = await inviaPushAUtenti(
      [owner.id],
      soglia === 100
        ? aConsumo
          ? pushTariffazioneAConsumo()
          : pushCreditiEsauriti(CREDIT_LABELS[kind])
        : pushCreditiAllOttantaPercento(CREDIT_LABELS[kind], Math.max(0, limite - usati), Boolean(aConsumo))
    );

    console.info("[CREDITS-THRESHOLD]", { organizationId, kind, soglia, outcome, push: push.inviate });
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
