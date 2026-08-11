import type { CancellationReason } from "@prisma/client";

/**
 * Motivi di disdetta e relative etichette.
 *
 * Modulo client-safe (niente `server-only`): servono sia al questionario nel
 * browser sia alla validazione della richiesta sul server, quindi vivono qui
 * invece che in `lib/billing/stripe.ts`.
 */
export const CANCELLATION_REASONS: CancellationReason[] = [
  "TOO_EXPENSIVE",
  "NOT_USED_ENOUGH",
  "MISSING_FEATURES",
  "CHOSE_ALTERNATIVE",
  "OTHER",
];

export const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
  TOO_EXPENSIVE: "Costa troppo",
  NOT_USED_ENOUGH: "Non lo uso abbastanza",
  MISSING_FEATURES: "Mancano funzionalità",
  CHOSE_ALTERNATIVE: "Ho scelto un'altra soluzione",
  OTHER: "Altro",
};

export function isCancellationReason(value: string): value is CancellationReason {
  return (CANCELLATION_REASONS as string[]).includes(value);
}
