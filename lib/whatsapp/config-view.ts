import "server-only";
import { prisma } from "@/lib/prisma";
import { readSecret } from "@/lib/env";
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

/**
 * Indirizzo a cui l'agenzia inoltra le email dei portali.
 *
 * # Perche' l'id dell'agenzia e non piu' un token segreto
 *
 * Perche' un indirizzo email non puo' essere un segreto: si consegna ai
 * portali, si incolla in una regola di inoltro, gira per le caselle
 * dell'agenzia. Fingere che lo sia porta a proteggere la cosa sbagliata.
 *
 * La difesa vera sta altrove ed e' la firma del webhook
 * (`INBOUND_EMAIL_SECRET`, verificata in `/api/leads/inbound-email`): senza
 * quella nessuna chiamata entra, e con quella il mittente e' il servizio di
 * ricezione, non chiunque conosca l'indirizzo.
 *
 * Resta vero che chi conosce l'indirizzo puo' scriverci e far nascere una
 * scheda: e' inevitabile per un recapito email, ed e' il motivo per cui la
 * richiesta nasce `PENDING` e passa dagli stessi controlli delle altre —
 * opt-out compreso.
 *
 * # Il dominio deve esistere davvero
 *
 * `INBOUND_EMAIL_DOMAIN` va impostato su un dominio con i record MX e la
 * ricezione configurata su Resend. Senza, questa funzione torna `null` e
 * l'interfaccia non mostra alcun indirizzo: un recapito che non riceve
 * farebbe perdere in silenzio ogni lead inoltrato — nessun rimbalzo, nessun
 * errore in dashboard, solo contatti che non arrivano mai.
 */
function inboundEmailAddress(organizationId: string): string | null {
  const domain = readSecret("INBOUND_EMAIL_DOMAIN");
  return domain ? `lead-${organizationId}@${domain.replace(/^@/, "")}` : null;
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
    inboundEmail: inboundEmailAddress(config.organizationId),
    webhookVerifyToken: config.webhookVerifyToken,
  };
}
