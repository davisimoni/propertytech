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

/** Esito della verifica quotidiana delle ancore. */
export interface EsitoVerificaAncore {
  /** Agenzie a pagamento esaminate. */
  controllate: number;
  /** Agenzie senza ancora: il mese di consumo non è allineato alla fatturazione. */
  senzaAncora: number;
  /** Ancora nel futuro: il periodo non scatterebbe mai. */
  ancoraNelFuturo: number;
  /** Nessuna riga contatori: il primo consumo fallirebbe. */
  senzaContatore: number;
}

/**
 * Rete di sicurezza quotidiana sulle ancore di fatturazione. **Non scrive.**
 *
 * # Cosa cerca, e cosa non è un problema
 *
 * Un `periodStart` vecchio **non** è un'anomalia: è il funzionamento normale.
 * I contatori si chiudono al primo accesso, quindi un'agenzia che non usa la
 * piattaforma da tre settimane ha legittimamente il periodo di tre settimane
 * fa. Segnalarlo riempirebbe i log di righe che non chiedono niente a
 * nessuno, ed è il modo più rapido per far smettere di leggerli.
 *
 * Le tre condizioni qui sotto invece non si sistemano da sole:
 *
 * - **Ancora mancante** su un piano a pagamento. Il primo accesso la imposta
 *   ad "adesso", quindi i crediti ripartono lo stesso — ma da un giorno
 *   qualsiasi invece che dalla data di rinnovo. L'agenzia paga il 3 e riceve
 *   la dotazione il 17: non si accorge di niente finché non conta, e quando
 *   conta ha ragione lei. Va scritta dal webhook al cambio piano o dallo
 *   script dei piani manuali: se manca, uno dei due non è passato.
 * - **Ancora nel futuro**, che `inizioPeriodo` non può che far scattare
 *   all'indietro: sintomo di una data scritta male, non di un uso lecito.
 * - **Contatori assenti**: `incrementUsage` fa una `update` su quella riga, e
 *   senza riga il primo consumo fallisce. Meglio saperlo la notte prima.
 *
 * Volutamente di sola lettura. Correggere in automatico significherebbe
 * scrivere un'ancora inventata sopra un dato che dovrebbe venire da Stripe, e
 * l'errore diventerebbe invisibile proprio mentre lo si nasconde.
 */
export async function verificaAncoreFatturazione(
  adesso: Date = new Date()
): Promise<EsitoVerificaAncore> {
  const agenzie = await prisma.organization.findMany({
    where: { subscription: { is: { status: { not: "trial" } } } },
    select: {
      id: true,
      agencyName: true,
      subscription: { select: { status: true, billingCycleAnchor: true } },
      usageTracker: { select: { periodStart: true } },
    },
  });

  const esito: EsitoVerificaAncore = {
    controllate: agenzie.length,
    senzaAncora: 0,
    ancoraNelFuturo: 0,
    senzaContatore: 0,
  };

  for (const agenzia of agenzie) {
    const ancora = agenzia.subscription?.billingCycleAnchor ?? null;
    const comune = {
      organizationId: agenzia.id,
      agenzia: agenzia.agencyName,
      piano: agenzia.subscription?.status,
    };

    if (!ancora) {
      esito.senzaAncora++;
      console.warn("[BILLING-ANCHOR] Piano a pagamento senza ancora di fatturazione", comune);
    } else if (ancora.getTime() > adesso.getTime()) {
      esito.ancoraNelFuturo++;
      console.warn("[BILLING-ANCHOR] Ancora di fatturazione nel futuro", {
        ...comune,
        ancora: ancora.toISOString(),
      });
    }

    if (!agenzia.usageTracker) {
      esito.senzaContatore++;
      console.warn("[BILLING-ANCHOR] Piano a pagamento senza riga contatori", comune);
    }
  }

  return esito;
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
