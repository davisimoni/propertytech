import { formatCount, formatEurCents, ENTERPRISE_OVERAGE_PRICE_EUR, PLANS, type Plan, type PlanId } from "@/lib/plans";
import type { UsageStatsResponse } from "@/lib/usage-types";

/**
 * Riquadro promozionale della newsletter: il piano successivo, quando serve.
 *
 * # Quando compare
 *
 * Solo se almeno un contatore del piano attuale ha superato l'80% — lo stesso
 * livello dell'avviso di servizio — e solo al titolare: è l'unico che può
 * cambiare piano (CLAUDE.md §4). A un collaboratore un invito a "passare a
 * Professional" mostrerebbe un comando che non può usare.
 *
 * # Perché i vantaggi si calcolano da `PLANS`
 *
 * Perché scriverli a mano significherebbe un listino in più da tenere
 * allineato: il giorno in cui il Professional passa a 600 conversazioni, la
 * newsletter continuerebbe a prometterne 500.
 */

export const SOGLIA_UPSELL = 0.8;

export const PIANO_SUCCESSIVO: Partial<Record<PlanId, PlanId>> = {
  trial: "starter",
  starter: "pro",
  pro: "enterprise",
};

const ETICHETTE = {
  whatsapp: "conversazioni WhatsApp",
  documents: "analisi documentali",
  voice: "report vocali",
  radar: "analisi di perizie d'asta",
} as const;

/** Contatori oltre la soglia, per nome leggibile. Vuoto se nessuno. */
export function contatoriOltreSoglia(stats: UsageStatsResponse, soglia = SOGLIA_UPSELL): string[] {
  const metriche = {
    whatsapp: stats.whatsapp,
    documents: stats.documents,
    voice: stats.voice,
    radar: stats.radar,
  };

  return (Object.keys(metriche) as (keyof typeof metriche)[])
    .filter((chiave) => {
      const m = metriche[chiave];
      // Illimitato (`null`) o non incluso (`0`): non esiste una percentuale.
      return m.isIncluded && m.limit !== null && m.limit > 0 && m.used / m.limit >= soglia;
    })
    .map((chiave) => ETICHETTE[chiave]);
}

function conteggio(valore: number | null): string {
  return valore === null ? "illimitate" : formatCount(valore);
}

/** Cosa guadagna l'agenzia passando da `corrente` a `successivo`, riga per riga. */
export function vantaggiPiano(corrente: Plan, successivo: Plan): string[] {
  const vantaggi: string[] = [];

  if (successivo.waConversationsLimit > corrente.waConversationsLimit) {
    const oggi =
      corrente.id === "trial"
        ? `${formatCount(corrente.waConversationsLimit)} totali`
        : `${formatCount(corrente.waConversationsLimit)} al mese`;
    vantaggi.push(
      `${formatCount(successivo.waConversationsLimit)} conversazioni WhatsApp al mese (oggi ${oggi})`
    );
  }

  const piuDocumenti =
    corrente.ocrDocumentsLimit !== null &&
    (successivo.ocrDocumentsLimit === null || successivo.ocrDocumentsLimit > corrente.ocrDocumentsLimit);
  if (piuDocumenti) {
    vantaggi.push(
      successivo.ocrDocumentsLimit === null
        ? "Analisi documentali illimitate"
        : `${formatCount(successivo.ocrDocumentsLimit)} analisi documentali`
    );
  }

  const piuPostazioni =
    corrente.seatsLimit !== null &&
    (successivo.seatsLimit === null || successivo.seatsLimit > corrente.seatsLimit);
  if (piuPostazioni) vantaggi.push(`Postazioni: ${conteggio(successivo.seatsLimit)}`);

  const piuAgende =
    corrente.agendasLimit !== null &&
    (successivo.agendasLimit === null || successivo.agendasLimit > corrente.agendasLimit);
  if (piuAgende) vantaggi.push(`Agende per le visite: ${conteggio(successivo.agendasLimit)}`);

  const piuPerizie =
    corrente.radarAppraisalsLimit !== null &&
    (successivo.radarAppraisalsLimit === null ||
      successivo.radarAppraisalsLimit > corrente.radarAppraisalsLimit);
  if (piuPerizie) {
    vantaggi.push(
      successivo.radarAppraisalsLimit === null
        ? "Analisi di perizie d'asta illimitate"
        : `${formatCount(successivo.radarAppraisalsLimit)} analisi di perizie d'asta al mese`
    );
  }

  if (successivo.documentVault && !corrente.documentVault) {
    vantaggi.push("Fascicolo documentale con checklist e scadenze");
  }
  if (successivo.socialMultiplier && !corrente.socialMultiplier) {
    vantaggi.push("Social e Annunci: testi per portali, Facebook, Instagram e Reel");
  }
  if (successivo.voiceSellerReporting && !corrente.voiceSellerReporting) {
    vantaggi.push("Report vocali post-visita per i proprietari");
  }
  if (successivo.waConversationsOverageNote && !corrente.waConversationsOverageNote) {
    vantaggi.push(
      `Oltre l'incluso l'assistente non si ferma: ${formatEurCents(ENTERPRISE_OVERAGE_PRICE_EUR)} a conversazione con fatturazione mensile`
    );
  }

  return vantaggi;
}

export interface DatiUpsell {
  pianoAttuale: Plan;
  pianoSuccessivo: Plan;
  contatori: string[];
  vantaggi: string[];
}

/**
 * Dati del riquadro, o `null` se non va mostrato: non titolare, nessun
 * contatore oltre soglia, o nessun piano successivo (Enterprise).
 */
export function upsellPer(stats: UsageStatsResponse, ruolo: "OWNER" | "AGENT"): DatiUpsell | null {
  if (ruolo !== "OWNER") return null;

  const idSuccessivo = PIANO_SUCCESSIVO[stats.planId];
  if (!idSuccessivo) return null;

  const contatori = contatoriOltreSoglia(stats);
  if (contatori.length === 0) return null;

  const pianoAttuale = PLANS[stats.planId];
  const pianoSuccessivo = PLANS[idSuccessivo];

  return {
    pianoAttuale,
    pianoSuccessivo,
    contatori,
    vantaggi: vantaggiPiano(pianoAttuale, pianoSuccessivo),
  };
}
