import "server-only";
import webpush, { WebPushError } from "web-push";
import { prisma } from "@/lib/prisma";
import { readSecret } from "@/lib/env";
import { BRAND } from "@/lib/brand";
import { isEndpointPushAmmesso } from "./endpoint";
import type { PushPayload } from "./messages";

/**
 * Invio delle notifiche push (Web Push con chiavi VAPID).
 *
 * # Stesse regole delle email di servizio
 *
 * Accompagna, non sostituisce, l'email degli stessi eventi critici: la push
 * arriva subito sul telefono, l'email resta come traccia con i dettagli. E
 * come le email non lancia mai: è un effetto collaterale di un evento già
 * registrato, e un servizio push che non risponde non deve far fallire una
 * conversazione WhatsApp.
 *
 * # Iscrizioni scadute
 *
 * Quando un browser revoca l'iscrizione (permesso tolto, dati cancellati,
 * app disinstallata) il servizio push risponde 404 o 410: la riga si elimina,
 * altrimenti si continuerebbe a tentare all'infinito verso un dispositivo che
 * non esiste più.
 */

const TTL_SECONDI = 24 * 60 * 60; // oltre un giorno un avviso "in tempo reale" non serve più
const TIMEOUT_MS = 10_000;

function vapid(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = readSecret("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  const privateKey = readSecret("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: readSecret("VAPID_SUBJECT") ?? `mailto:${BRAND.email}`,
  };
}

export function isPushConfigured(): boolean {
  return vapid() !== null;
}

export interface EsitoPush {
  inviate: number;
  rimosse: number;
  fallite: number;
}

/** Invia la stessa notifica a tutti i dispositivi di questi utenti. Non lancia. */
export async function inviaPushAUtenti(userIds: string[], payload: PushPayload): Promise<EsitoPush> {
  const esito: EsitoPush = { inviate: 0, rimosse: 0, fallite: 0 };
  const chiavi = vapid();
  const destinatari = [...new Set(userIds.filter(Boolean))];
  if (!chiavi || destinatari.length === 0) return esito;

  try {
    const iscrizioni = await prisma.pushSubscription.findMany({
      where: { userId: { in: destinatari } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    const corpo = JSON.stringify(payload);

    await Promise.all(
      iscrizioni.map(async (iscrizione) => {
        // Ricontrollato anche qui e non solo all'iscrizione: una riga scritta
        // prima di questa regola, o a mano, non deve far chiamare al server un
        // indirizzo qualsiasi.
        if (!isEndpointPushAmmesso(iscrizione.endpoint)) {
          await prisma.pushSubscription.delete({ where: { id: iscrizione.id } }).catch(() => undefined);
          esito.rimosse += 1;
          return;
        }

        try {
          await webpush.sendNotification(
            {
              endpoint: iscrizione.endpoint,
              keys: { p256dh: iscrizione.p256dh, auth: iscrizione.auth },
            },
            corpo,
            {
              vapidDetails: chiavi,
              TTL: TTL_SECONDI,
              urgency: "high",
              timeout: TIMEOUT_MS,
            }
          );
          esito.inviate += 1;
          await prisma.pushSubscription
            .update({ where: { id: iscrizione.id }, data: { lastSuccessAt: new Date() } })
            .catch(() => undefined);
        } catch (error) {
          const stato = error instanceof WebPushError ? error.statusCode : null;
          if (stato === 404 || stato === 410) {
            await prisma.pushSubscription.delete({ where: { id: iscrizione.id } }).catch(() => undefined);
            esito.rimosse += 1;
            return;
          }
          esito.fallite += 1;
          console.error("[push] Invio non riuscito", {
            stato,
            // L'host del servizio e non l'endpoint intero: l'endpoint
            // identifica un dispositivo.
            servizio: new URL(iscrizione.endpoint).hostname,
            reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
          });
        }
      })
    );
  } catch (error) {
    console.error("[push] Invio non riuscito", {
      reason: error instanceof Error ? error.message : "unknown",
    });
  }

  if (esito.inviate || esito.rimosse || esito.fallite) {
    console.info("[PUSH]", { tag: payload.tag, ...esito });
  }
  return esito;
}
