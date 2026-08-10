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
 * I lead qualificati sono contati dalla tabella Lead e non dal contatore
 * crediti: il credito viene consumato all'ingaggio, mentre qui interessa
 * quanti contatti sono arrivati davvero a qualificarsi.
 */
export async function getRoiMetrics(organizationId: string): Promise<RoiMetrics> {
  const [qualifiedLeads, usage] = await Promise.all([
    prisma.lead.count({
      where: { organizationId, qualificationStatus: "QUALIFIED" },
    }),
    prisma.usageTracker.findUnique({
      where: { organizationId },
      select: { docCreditsUsed: true },
    }),
  ]);

  const documentsAnalyzed = usage?.docCreditsUsed ?? 0;

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
