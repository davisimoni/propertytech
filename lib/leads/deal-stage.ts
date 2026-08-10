import type { DealStage, QualificationStatus } from "@prisma/client";

/**
 * Fasi della trattativa mostrate sulla board Kanban.
 *
 * Modulo puro e client-safe: le stesse etichette servono al server che valida
 * e alla board che disegna le colonne.
 */

/** Ordine delle colonne, da sinistra a destra. */
export const DEAL_STAGES: DealStage[] = [
  "NEW",
  "QUALIFIED",
  "VISIT_SCHEDULED",
  "OFFER_SENT",
  "WON",
  "LOST",
];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  NEW: "Nuovo Lead",
  QUALIFIED: "Qualificato WhatsApp",
  VISIT_SCHEDULED: "Visita Programmata",
  OFFER_SENT: "Proposta Inviata",
  WON: "Chiuso Vinto",
  LOST: "Chiuso Perso",
};

/** Colore della colonna e del badge, coerente con i codici del Modulo 1. */
export const DEAL_STAGE_ACCENT: Record<DealStage, string> = {
  NEW: "bg-muted-foreground",
  QUALIFIED: "bg-status-qualified",
  VISIT_SCHEDULED: "bg-primary",
  OFFER_SENT: "bg-status-pending",
  WON: "bg-status-qualified",
  LOST: "bg-status-blocked",
};

export function isDealStage(value: string): value is DealStage {
  return (DEAL_STAGES as string[]).includes(value);
}

/**
 * Fase iniziale dedotta dallo stato di qualifica.
 *
 * Serve **solo** a dare una posizione di partenza ai lead già esistenti e a
 * quelli appena creati. Da lì in poi la colonna la decide l'agente: se questa
 * derivazione girasse a ogni messaggio, riporterebbe indietro le schede
 * spostate a mano, che è esattamente il motivo per cui i due campi sono
 * separati.
 */
export function initialDealStage(status: QualificationStatus): DealStage {
  switch (status) {
    case "QUALIFIED":
      return "QUALIFIED";
    case "UNQUALIFIED":
    case "OPT_OUT":
      return "LOST";
    default:
      return "NEW";
  }
}

/** Fasi che chiudono la trattativa: non hanno un seguito operativo. */
export function isClosedStage(stage: DealStage): boolean {
  return stage === "WON" || stage === "LOST";
}
