import "server-only";
import { timingSafeEqual } from "node:crypto";
import { readSecret } from "@/lib/env";

/**
 * Autorizza una chiamata dello scheduler.
 *
 * Vercel Cron invia `Authorization: Bearer $CRON_SECRET`; gli scheduler
 * esterni possono usare anche `x-cron-secret`. Fail-closed: senza segreto
 * configurato la rotta resta chiusa, invece di diventare un endpoint pubblico
 * che chiunque può far girare a ripetizione — e per la newsletter vorrebbe
 * dire poter spedire email a tutti gli utenti.
 */
export function isCronAuthorized(request: Request): boolean {
  const expected = readSecret("CRON_SECRET");
  if (!expected) return false;

  const header =
    request.headers.get("authorization") ?? request.headers.get("x-cron-secret") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "");

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
