import type { PlanId } from "@/lib/plans";

export type UsageFeature = "whatsapp" | "documents" | "voice" | "radar";

export interface UsageMetric {
  used: number;
  /** `null` = illimitato, `0` = funzione non compresa nel piano. */
  limit: number | null;
  remaining: number | null;
  /**
   * Crediti esauriti: si applica solo a una funzione che il piano include.
   *
   * Distinto da `isIncluded` perché sono due situazioni diverse per l'utente:
   * i crediti finiti si ricaricano con un rinnovo, una funzione assente si
   * ottiene cambiando piano. Confonderle mostrava "Limiti raggiunti" in rosso
   * a un account Trial appena creato, che non aveva consumato nulla.
   */
  isLimitReached: boolean;
  /** `false` quando il piano non comprende affatto la funzione (limite 0). */
  isIncluded: boolean;
}

export interface UsageStatsResponse {
  planId: PlanId;
  planName: string;
  whatsapp: UsageMetric;
  documents: UsageMetric;
  voice: UsageMetric;
  radar: UsageMetric;
  hasAnyLimitReached: boolean;
}
