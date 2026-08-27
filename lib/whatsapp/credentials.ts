import "server-only";
import type { WhatsAppConfig } from "@prisma/client";
import { decryptSecret, encryptSecret, isEncryptionAvailable } from "@/lib/crypto/secrets";
import { isWhatsAppProviderId, type WhatsAppProviderId } from "./provider";
import type { ResolvedWhatsAppCredentials } from "./client";

/**
 * Confine di cifratura del token di accesso WhatsApp.
 *
 * Il token della Cloud API permette di **inviare messaggi a nome dell'agenzia**:
 * in chiaro nel database sarebbe leggibile da qualunque copia — un backup, un
 * dump, un accesso di sola lettura — e chi lo ottiene può scrivere ai clienti
 * dell'agenzia fingendosi lei. È lo stesso rischio della chiave del gestionale,
 * e va trattato allo stesso modo.
 *
 * Tutto passa da qui e non dai singoli punti di lettura: sparpagliare
 * `decryptSecret` su sei chiamate significa che al settimo punto qualcuno
 * dimentica, e il token torna in chiaro senza che nulla lo segnali.
 */

/** Marca dei valori cifrati, per distinguerli da un eventuale dato preesistente. */
const ENCRYPTED_PREFIX = "enc.v1.";

/**
 * Cifra il token prima del salvataggio.
 *
 * Lancia se la cifratura non è disponibile: meglio un salvataggio fallito con
 * messaggio chiaro che un token scritto in chiaro senza che nessuno se ne
 * accorga.
 */
export function encryptAccessToken(plaintext: string): string {
  if (!isEncryptionAvailable()) {
    throw new Error("Cifratura non disponibile: definisci ENCRYPTION_KEY o NEXTAUTH_SECRET.");
  }

  return encryptSecret(plaintext);
}

/**
 * Restituisce il token utilizzabile, o `null`.
 *
 * `null` in tre casi che vanno trattati allo stesso modo — l'agenzia ricollega
 * WhatsApp — ma che vale la pena distinguere nei log:
 *  - non c'è alcun token;
 *  - il valore non è cifrato (dato precedente a questa modifica, o backup
 *    ripristinato): **non lo si usa comunque**, altrimenti la cifratura
 *    sarebbe aggirabile ripristinando un backup vecchio;
 *  - il valore è cifrato ma non decifrabile (chiave ruotata, dato corrotto).
 */
export function decryptAccessToken(stored: string | null | undefined): string | null {
  if (!stored) return null;

  if (!stored.startsWith(ENCRYPTED_PREFIX)) {
    console.warn(
      "[whatsapp/credentials] Token non cifrato ignorato: l'agenzia deve ricollegare WhatsApp."
    );
    return null;
  }

  const token = decryptSecret(stored);

  if (!token) {
    console.warn(
      "[whatsapp/credentials] Token cifrato non decifrabile: chiave di cifratura cambiata o dato corrotto."
    );
  }

  return token;
}

/**
 * Vero quando il token esiste **ed è utilizzabile**.
 *
 * Distinto da `Boolean(config.metaAccessToken)`: un token presente ma non
 * decifrabile mostrerebbe la connessione come a posto mentre ogni invio
 * fallisce, e l'agenzia non avrebbe modo di capire perché.
 */
export function hasUsableAccessToken(stored: string | null | undefined): boolean {
  return decryptAccessToken(stored) !== null;
}

/**
 * Risolve le credenziali di invio dal provider configurato dall'agenzia.
 *
 * Unico punto in cui un token cifrato in `WhatsAppConfig` diventa un valore
 * utilizzabile per l'invio: stesso principio del resto del file, esteso ai
 * provider aggiunti dopo Meta. `sendWhatsAppMessageForProvider` (client.ts)
 * riceve solo il risultato, mai il record grezzo.
 */
export function resolveWhatsAppCredentials(config: WhatsAppConfig): ResolvedWhatsAppCredentials {
  const provider: WhatsAppProviderId = isWhatsAppProviderId(config.provider)
    ? config.provider
    : "meta";

  switch (provider) {
    case "qr":
      // Nessun segreto da decifrare: le chiavi della sessione vivono sul
      // microservizio, qui c'è solo il riferimento con cui interrogarlo.
      return {
        provider,
        qr: config.qrSessionId ? { sessionId: config.qrSessionId } : undefined,
      };

    case "twilio":
      return {
        provider,
        twilio:
          config.twilioAccountSid && config.twilioWhatsAppNumber
            ? {
                accountSid: config.twilioAccountSid,
                authToken: decryptAccessToken(config.twilioAuthToken) ?? "",
                fromWhatsAppNumber: config.twilioWhatsAppNumber,
              }
            : undefined,
      };

    case "generic":
      return {
        provider,
        generic: config.genericSendUrl
          ? {
              sendUrl: config.genericSendUrl,
              authToken: decryptAccessToken(config.genericAuthToken),
            }
          : undefined,
      };

    case "meta":
    default:
      return {
        provider: "meta",
        meta: {
          metaAccessToken: decryptAccessToken(config.metaAccessToken) ?? "",
          metaPhoneAccountId: config.metaPhoneAccountId ?? "",
        },
      };
  }
}
