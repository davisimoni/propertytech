import "server-only";
import { prisma } from "@/lib/prisma";
import { hasUsableAccessToken } from "./credentials";
import { isWhatsAppProviderId, type WhatsAppProviderId } from "./provider";

/**
 * Config e vista pubblica di `WhatsAppConfig`, condivise da tutte le rotte
 * che possono creare o aggiornare il collegamento di un'agenzia: il modulo
 * manuale (`/api/whatsapp/config`) e l'Embedded Signup guidato
 * (`/api/whatsapp/meta/embedded-signup`). Un'unica definizione evita che le
 * due finiscano per esporre forme leggermente diverse della stessa entità.
 */

/**
 * Il token d'ingestione e il verify token sono creati alla prima lettura, così
 * l'agenzia trova subito URL webhook ed email dedicata pronti da incollare nei
 * portali, prima ancora di connettere WhatsApp.
 */
export async function getOrCreateWhatsAppConfig(organizationId: string) {
  return prisma.whatsAppConfig.upsert({
    where: { organizationId },
    create: { organizationId, webhookVerifyToken: crypto.randomUUID() },
    update: {},
  });
}

/** Non espone mai token o Auth Token in chiaro: solo flag di presenza. */
export function toPublicWhatsAppConfig(config: Awaited<ReturnType<typeof getOrCreateWhatsAppConfig>>) {
  const provider: WhatsAppProviderId = isWhatsAppProviderId(config.provider) ? config.provider : "meta";

  return {
    provider,
    isConnected: config.isConnected,
    phoneNumber: config.phoneNumber,
    metaPhoneAccountId: config.metaPhoneAccountId,
    // Non `Boolean(...)`: un token presente ma non decifrabile mostrerebbe la
    // connessione a posto mentre ogni invio fallisce, e l'agenzia non avrebbe
    // modo di capire perché.
    hasAccessToken: hasUsableAccessToken(config.metaAccessToken),
    twilioAccountSid: config.twilioAccountSid,
    twilioWhatsAppNumber: config.twilioWhatsAppNumber,
    hasTwilioAuthToken: hasUsableAccessToken(config.twilioAuthToken),
    genericSendUrl: config.genericSendUrl,
    hasGenericAuthToken: hasUsableAccessToken(config.genericAuthToken),
    inboundToken: config.inboundToken,
    webhookVerifyToken: config.webhookVerifyToken,
  };
}
