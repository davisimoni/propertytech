import { prisma } from "@/lib/prisma";
import { PLANS, type PlanId } from "@/lib/plans";

/**
 * Il mese di consumo: quando i contatori ripartono da zero.
 *
 * # Perché ancorato a una data e non agli eventi Stripe
 *
 * Finché i contatori si azzeravano solo nel webhook, succedevano tre cose
 * sbagliate insieme:
 *
 * - un piano **annuale** riceve un evento di rinnovo una volta l'anno, quindi
 *   le conversazioni "al mese" gli ripartivano una volta l'anno;
 * - **qualsiasi** aggiornamento dell'abbonamento (una disdetta programmata,
 *   una postazione in più) le azzerava a metà mese, regalando un'altra
 *   dotazione intera;
 * - i piani assegnati a mano ai beta tester, senza abbonamento Stripe, non si
 *   azzeravano mai.
 *
 * Ora il mese si calcola dall'ancora (`Subscription.billingCycleAnchor`, la
 * `billing_cycle_anchor` di Stripe) e il primo accesso dopo la scadenza chiude
 * il periodo. Nessun evento da aspettare, e la stessa regola per mensile,
 * annuale e piani manuali. Il Trial resta fuori: le sue conversazioni sono
 * complessive, non mensili.
 *
 * Nessun `server-only`: lo usa anche `scripts/assegna-piano.ts`.
 */

/**
 * `mesi` mesi dopo l'ancora, con la regola di Stripe per i giorni che non
 * esistono: un'ancora al 31 cade il 28 (o 29) febbraio e torna al 31 a marzo.
 * Sempre calcolato dall'ancora originale e non dal mese precedente, altrimenti
 * dopo febbraio il giorno resterebbe 28 per sempre.
 */
export function aggiungiMesi(ancora: Date, mesi: number): Date {
  const meseAssoluto = ancora.getUTCMonth() + mesi;
  const anno = ancora.getUTCFullYear() + Math.floor(meseAssoluto / 12);
  const mese = ((meseAssoluto % 12) + 12) % 12;
  const giorniNelMese = new Date(Date.UTC(anno, mese + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      anno,
      mese,
      Math.min(ancora.getUTCDate(), giorniNelMese),
      ancora.getUTCHours(),
      ancora.getUTCMinutes(),
      ancora.getUTCSeconds(),
      ancora.getUTCMilliseconds()
    )
  );
}

/** Inizio del mese di consumo che contiene `adesso`. */
export function inizioPeriodo(ancora: Date, adesso: Date): Date {
  let mesi =
    (adesso.getUTCFullYear() - ancora.getUTCFullYear()) * 12 +
    (adesso.getUTCMonth() - ancora.getUTCMonth());
  let inizio = aggiungiMesi(ancora, mesi);

  while (inizio.getTime() > adesso.getTime()) {
    mesi -= 1;
    inizio = aggiungiMesi(ancora, mesi);
  }
  return inizio;
}

/**
 * Quanta parte dei crediti acquistati è stata usata nel periodo che si chiude.
 *
 * Il pacchetto si somma al piano e "resta finché non lo usi" (così lo
 * presenta il popup d'acquisto): si consuma solo con le conversazioni oltre la
 * dotazione del piano, e il resto passa al mese dopo. Senza questo calcolo
 * `bonusWhatsappCredits` non scendeva mai, e un pacchetto da 100 alzava il
 * limite di 100 ogni mese per sempre.
 */
export function bonusConsumato(usati: number, limitePiano: number, bonus: number): number {
  return Math.min(Math.max(0, bonus), Math.max(0, usati - limitePiano));
}

/** Contatori e memoria degli avvisi a inizio periodo. Radar compreso: sono perizie al mese. */
export const CONTATORI_AZZERATI = {
  whatsappCreditsUsed: 0,
  docCreditsUsed: 0,
  voiceCreditsUsed: 0,
  radarCreditsUsed: 0,
  whatsappNotifiedPct: 0,
  docNotifiedPct: 0,
  voiceNotifiedPct: 0,
  radarNotifiedPct: 0,
} as const;

export type EsitoPeriodo = "invariato" | "avviato" | "azzerato";

const TENTATIVI = 3;

/**
 * Chiude il mese di consumo se è finito. Da chiamare prima di leggere o
 * incrementare i contatori.
 *
 * - Piano senza ancora (assegnato prima di questa regola): l'ancora diventa
 *   adesso e il consumo esistente **resta** — non sappiamo a quale mese
 *   appartenga, e cancellarlo potrebbe regalare una dotazione.
 * - Contatore senza `periodStart`: si registra il periodo corrente, stesso
 *   criterio.
 * - Periodo scaduto: azzeramento condizionato al `periodStart` e al consumo
 *   letti, così due richieste parallele alla scadenza non chiudono il mese
 *   due volte né scalano due volte il bonus. Chi perde la gara rilegge.
 */
export async function assicuraPeriodoCorrente(
  organizationId: string,
  adesso: Date = new Date()
): Promise<EsitoPeriodo> {
  for (let tentativo = 0; tentativo < TENTATIVI; tentativo++) {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        bonusWhatsappCredits: true,
        subscription: { select: { status: true, billingCycleAnchor: true } },
        usageTracker: { select: { periodStart: true, whatsappCreditsUsed: true } },
      },
    });

    const subscription = organization?.subscription;
    const tracker = organization?.usageTracker;
    if (!organization || !subscription || !tracker || subscription.status === "trial") {
      return "invariato";
    }

    if (!subscription.billingCycleAnchor) {
      await prisma.$transaction([
        prisma.subscription.updateMany({
          where: { organizationId, billingCycleAnchor: null },
          data: { billingCycleAnchor: adesso },
        }),
        prisma.usageTracker.updateMany({
          where: { organizationId, periodStart: null },
          data: { periodStart: adesso },
        }),
      ]);
      return "avviato";
    }

    const inizio = inizioPeriodo(subscription.billingCycleAnchor, adesso);

    if (!tracker.periodStart) {
      await prisma.usageTracker.updateMany({
        where: { organizationId, periodStart: null },
        data: { periodStart: inizio },
      });
      return "avviato";
    }

    if (tracker.periodStart.getTime() >= inizio.getTime()) return "invariato";

    const bonusDaScalare = bonusConsumato(
      tracker.whatsappCreditsUsed,
      PLANS[subscription.status].waConversationsLimit,
      organization.bonusWhatsappCredits
    );

    const chiuso = await prisma.$transaction(async (tx) => {
      const aggiornati = await tx.usageTracker.updateMany({
        where: {
          organizationId,
          periodStart: tracker.periodStart,
          // Anche il consumo letto: se nel frattempo è cambiato, il bonus
          // calcolato sopra non è più esatto e si rifà il giro.
          whatsappCreditsUsed: tracker.whatsappCreditsUsed,
        },
        data: { ...CONTATORI_AZZERATI, periodStart: inizio },
      });
      if (aggiornati.count === 0) return false;

      if (bonusDaScalare > 0) {
        await tx.organization.update({
          where: { id: organizationId },
          data: { bonusWhatsappCredits: { decrement: bonusDaScalare } },
        });
      }
      return true;
    });

    if (chiuso) {
      console.info("[USAGE-PERIOD]", {
        organizationId,
        periodStart: inizio.toISOString(),
        bonusScalato: bonusDaScalare,
      });
      return "azzerato";
    }
  }

  return "invariato";
}

/**
 * Scritture per un cambio di piano: nuovo periodo e bonus consumato.
 *
 * Usata dal webhook e dallo script dei piani manuali, così le due strade non
 * possono azzerare in modi diversi. Il bonus si scala sul limite del piano
 * **precedente**: è sotto quel piano che il periodo che si chiude è stato
 * consumato.
 */
export function datiCambioPiano(params: {
  pianoPrecedente: PlanId;
  usatiWhatsapp: number;
  bonus: number;
  ancora: Date;
  adesso: Date;
}): { tracker: typeof CONTATORI_AZZERATI & { periodStart: Date }; bonusDaScalare: number } {
  return {
    tracker: { ...CONTATORI_AZZERATI, periodStart: inizioPeriodo(params.ancora, params.adesso) },
    bonusDaScalare: bonusConsumato(
      params.usatiWhatsapp,
      PLANS[params.pianoPrecedente].waConversationsLimit,
      params.bonus
    ),
  };
}
