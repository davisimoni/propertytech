import type { PropertyStatus } from "@prisma/client";
import { PUBLISHED_STATUSES } from "./property-fields";

/**
 * Stati per cui la scadenza dell'incarico ha conseguenze.
 *
 * Coincide con gli stati pubblicabili, e non e' una coincidenza: un mandato
 * scaduto conta perche' impedisce la pubblicazione, quindi su una bozza o su
 * un venduto non c'e' nulla da segnalare.
 *
 * Vive in un modulo proprio perche' `mandate.ts` e' importato anche dai
 * componenti client, mentre il controllo pianificato e' server-only: separarli
 * evita di trascinare l'uno dentro il bundle dell'altro.
 */
export const PUBLISHED_STATUSES_FOR_MANDATE: readonly PropertyStatus[] = PUBLISHED_STATUSES;

export { daysUntilExpiry, mandateStatus, isPublishable } from "./mandate";
