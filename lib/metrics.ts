import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Minuti di lavoro manuale che ogni automazione sostituisce.
 *
 * Sono stime dichiarate, non misurazioni: la dashboard le presenta come tali.
 * Tenerle qui, e non sparse nella UI, permette di ritararle in un punto solo
 * quando si avranno dati d'uso reali.
 */
export const MINUTES_SAVED = {
  /** Contatto qualificato: richiamo, tre domande, annotazione in scheda. */
  perQualifiedLead: 15,
  /** Visura o atto: lettura del PDF e ricopiatura dei dati catastali. */
  perDocument: 30,
} as const;

export interface RoiMetrics {
  qualifiedLeads: number;
  documentsAnalyzed: number;
  /** Ore risparmiate, arrotondate per difetto. */
  hoursSaved: number;
  minutesSaved: number;
}

/**
 * Indicatori di ritorno per il titolare dell'agenzia.
 *
 * # Perché nessuno dei due numeri viene dai contatori crediti
 *
 * Perché i contatori sono la **dotazione del mese**, e si azzerano al rinnovo
 * (`lib/billing/usage-period.ts`). Vanno benissimo per dire quanto resta da
 * spendere, e malissimo per dire quanto ha reso il prodotto.
 *
 * I lead lo evitavano già, contando dalla tabella `Lead`. Le visure no:
 * leggevano `docCreditsUsed`, cioè un numero che il primo giorno del ciclo
 * torna a zero. Il primo del mese un'agenzia con duecento visure alle spalle
 * apriva la Dashboard e trovava «Visure e atti letti: 0», e con essa crollava
 * «Ore tornate in agenda», che somma i due. Il momento in cui si guarda quel
 * riquadro è proprio quello in cui si decide se rinnovare.
 *
 * Ora entrambi contano righe che restano: i lead qualificati da `Lead`, le
 * estrazioni da `AiGeneration`, dove ogni documento letto lascia la sua
 * elaborazione in cronologia. Sono numeri di vita dell'agenzia, non del mese.
 */
export async function getRoiMetrics(organizationId: string): Promise<RoiMetrics> {
  const [qualifiedLeads, documentsAnalyzed] = await Promise.all([
    prisma.lead.count({
      where: { organizationId, qualificationStatus: "QUALIFIED" },
    }),
    prisma.aiGeneration.count({
      where: { organizationId, kind: "DOCUMENT_EXTRACTION" },
    }),
  ]);

  const minutesSaved =
    qualifiedLeads * MINUTES_SAVED.perQualifiedLead +
    documentsAnalyzed * MINUTES_SAVED.perDocument;

  return {
    qualifiedLeads,
    documentsAnalyzed,
    hoursSaved: Math.floor(minutesSaved / 60),
    minutesSaved,
  };
}

/** Formatta il tempo risparmiato in modo leggibile anche sotto l'ora. */
export function formatTimeSaved(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (remainder === 0) return `${hours} h`;
  return `${hours} h ${remainder} min`;
}
