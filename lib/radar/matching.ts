import "server-only";
import { prisma } from "@/lib/prisma";
import { scorePropertyForLead, PERFECT_MATCH_THRESHOLD } from "@/lib/matching/smart-match";

/**
 * Incrocia un lotto del Radar con i lead già in pipeline.
 *
 * # Perché riusa il motore esistente senza adattatori
 *
 * `scorePropertyForLead` accetta un'interfaccia strutturale — comune, zona,
 * tipologia, prezzo, metri quadri — non il modello Prisma `Property`. È il
 * motivo per cui `RadarProperty` porta esattamente quei nomi: il punteggio di
 * un lotto all'asta si calcola con lo stesso codice che valuta il portafoglio
 * dell'agenzia, e un'agenzia che cambia i criteri li cambia in un posto solo.
 *
 * # Cosa NON fa
 *
 * Non manda nulla. Scrive gli abbinamenti e si ferma: l'invio al cliente è un
 * gesto dell'agente, e passa da una rotta separata che richiede una conferma
 * esplicita. Un modulo che scopre un'asta e scrive da solo ai contatti è il
 * modo più rapido di far bloccare il numero dell'agenzia — e di proporre a un
 * cliente un immobile che nessuno ha guardato.
 */

/** Sotto questa soglia l'abbinamento non viene nemmeno registrato. */
export const RADAR_MATCH_THRESHOLD = 50;

export interface RadarMatchOutcome {
  evaluated: number;
  matched: number;
  perfect: number;
}

/**
 * Ricalcola gli abbinamenti di un lotto.
 *
 * I lead considerati sono quelli dell'agenzia che hanno almeno un criterio
 * utile: senza né budget né zona né tipologia il punteggio sarebbe calcolato
 * sul nulla e restituirebbe un abbinamento che non significa niente.
 *
 * Esclusi i contatti in opt-out: un abbinamento che nessuno potrà mai usare
 * occupa solo spazio nell'elenco, e mostrarlo invita a un invio che la rotta
 * di notifica rifiuterebbe comunque.
 */
export async function runRadarMatching(
  organizationId: string,
  radarPropertyId: string
): Promise<RadarMatchOutcome> {
  const radar = await prisma.radarProperty.findFirst({
    where: { id: radarPropertyId, organizationId },
    select: {
      id: true,
      comune: true,
      zona: true,
      type: true,
      priceEur: true,
      squareMeters: true,
    },
  });

  if (!radar) return { evaluated: 0, matched: 0, perfect: 0 };

  const leads = await prisma.lead.findMany({
    where: {
      organizationId,
      qualificationStatus: { not: "OPT_OUT" },
      OR: [
        { budgetMax: { not: null } },
        { preferredZone: { not: null } },
        { preferredType: { not: null } },
      ],
    },
    select: {
      id: true,
      preferredZone: true,
      preferredType: true,
      budgetMin: true,
      budgetMax: true,
      minSquareMeters: true,
    },
  });

  let matched = 0;
  let perfect = 0;

  for (const lead of leads) {
    const result = scorePropertyForLead(radar, lead);

    if (result.score < RADAR_MATCH_THRESHOLD) {
      /*
       * Sotto soglia si cancella un eventuale abbinamento precedente.
       *
       * Un lotto ribassato, o un lead che corregge il budget, possono far
       * scendere un punteggio che prima era buono. Lasciare la riga vecchia
       * mostrerebbe all'agente un abbinamento che i dati attuali non
       * giustificano piu'.
       */
      await prisma.auctionLeadMatch.deleteMany({
        where: { radarPropertyId: radar.id, leadId: lead.id, notifiedAt: null },
      });
      continue;
    }

    await prisma.auctionLeadMatch.upsert({
      where: { radarPropertyId_leadId: { radarPropertyId: radar.id, leadId: lead.id } },
      create: {
        radarPropertyId: radar.id,
        leadId: lead.id,
        organizationId,
        score: result.score,
        reasons: result.reasons,
      },
      // `seenAt` e `notifiedAt` non si toccano: sono la memoria di cosa
      // l'agente ha già guardato e a chi ha già scritto. Azzerarli a ogni
      // ricalcolo farebbe riproporre lo stesso contatto all'infinito.
      update: { score: result.score, reasons: result.reasons },
    });

    matched++;
    if (result.score >= PERFECT_MATCH_THRESHOLD) perfect++;
  }

  console.info("[RADAR-MATCH]", {
    organizationId,
    radarPropertyId,
    valutati: leads.length,
    abbinati: matched,
  });

  return { evaluated: leads.length, matched, perfect };
}
