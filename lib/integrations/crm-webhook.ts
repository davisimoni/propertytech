import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Lead } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parsePublicHttpUrl } from "@/lib/net/safe-url";
import { decryptSecret } from "@/lib/crypto/secrets";
import {
  getProvider,
  isHostAllowed,
  mapLeadFields,
  resolveFieldMap,
  type CrmProvider,
  type LeadValues,
} from "@/lib/integrations/providers";

/**
 * Integrazione con il gestionale / MLS dell'agenzia.
 *
 * Quando un lead diventa QUALIFIED, il payload viene inoltrato all'endpoint
 * configurato dall'agenzia (Zapier, Make, Gestim o qualsiasi API esterna). È
 * il pezzo che evita all'agente il doppio inserimento manuale — la ragione
 * numero uno per cui uno strumento come questo viene abbandonato dopo un mese.
 */

const DELIVERY_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;

/** Eventi che l'agenzia può ricevere sul proprio endpoint. */
export type CrmEvent = "lead.qualified" | "lead.appointment_cancelled" | "ping";

export interface CrmDeliveryResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/** Genera il segreto di firma alla prima configurazione dell'endpoint. */
export function generateWebhookSecret(): string {
  return `pts_${randomBytes(24).toString("hex")}`;
}

/**
 * Firma HMAC-SHA256 del corpo della richiesta.
 *
 * Permette al gestionale di distinguere una chiamata nostra da una di chiunque
 * abbia scoperto l'URL: senza firma, un endpoint webhook è un'API pubblica che
 * accetta lead falsi da chiunque.
 */
export function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/** Confronto a tempo costante, per chi verifica la firma lato ricevente. */
export function verifySignature(secret: string, body: string, signature: string): boolean {
  const expected = Buffer.from(signPayload(secret, body), "utf8");
  const received = Buffer.from(signature, "utf8");

  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

/** Valori grezzi del lead, prima di prendere i nomi del gestionale scelto. */
export function extractLeadValues(lead: Lead): LeadValues {
  return {
    nome: lead.clientName,
    telefono: lead.clientPhone,
    fonte: lead.portalSource,
    immobile: lead.propertyRef,
    stato: lead.qualificationStatus,
    budget: lead.budget,
    mutuo: lead.mortgageApproved,
    deveVenderePrima: lead.mustSellFirst,
    tempistica: lead.timeframe,
    appuntamento: lead.appointmentSlot?.toISOString() ?? null,
    appuntamentoConfermato: lead.appointmentConfirmed,
    immobiliPosseduti: lead.ownedPropertiesCount,
    categoriaVenditore: lead.sellerCategory,
    creatoIl: lead.createdAt.toISOString(),
  };
}

/**
 * Corpo inviato al gestionale, nella forma e coi nomi che quel gestionale usa.
 *
 * `nested` conserva la forma storica `{ event, agency, lead: {…} }`: è quella
 * che gli endpoint già configurati si aspettano, e cambiarla romperebbe le
 * integrazioni attive. `flat` mette i campi in cima, perché Zapier e Make
 * espongono i campi annidati come `lead__nome` e li rendono scomodi da mappare.
 */
export function buildLeadPayload(
  lead: Lead,
  event: CrmEvent,
  agencyName: string,
  provider: CrmProvider,
  fieldMap: Record<string, string>
): Record<string, unknown> {
  const mapped = mapLeadFields(
    extractLeadValues(lead),
    resolveFieldMap(provider, fieldMap)
  );

  const envelope = {
    event,
    sentAt: new Date().toISOString(),
    agency: agencyName,
    leadId: lead.id,
  };

  return provider.bodyShape === "nested"
    ? { ...envelope, lead: { id: lead.id, ...mapped } }
    : { ...envelope, ...mapped };
}

/** Credenziali risolte per una consegna. */
export interface CrmAuth {
  /** Segreto di firma HMAC, per il provider `webhook`. */
  signingSecret?: string | null;
  /** Token Bearer o chiave API, già decifrato. */
  token?: string | null;
  /** Utente per l'autenticazione Basic. */
  user?: string | null;
}

/**
 * Header di autenticazione secondo lo schema del provider.
 *
 * Separata dalla consegna perché è la parte che si sbaglia più facilmente e
 * che conviene poter verificare da sola.
 */
export function buildAuthHeaders(
  provider: CrmProvider,
  auth: CrmAuth,
  body: string
): Record<string, string> {
  switch (provider.auth) {
    case "hmac":
      return auth.signingSecret
        ? { "X-PropertyTech-Signature": signPayload(auth.signingSecret, body) }
        : {};

    case "bearer":
      return auth.token ? { Authorization: `Bearer ${auth.token}` } : {};

    case "api_key_header":
      return auth.token && provider.authHeaderName
        ? { [provider.authHeaderName]: auth.token }
        : {};

    case "basic":
      return auth.token
        ? {
            Authorization: `Basic ${Buffer.from(`${auth.user ?? ""}:${auth.token}`).toString("base64")}`,
          }
        : {};

    // L'URL stesso è il segreto: nessun header da aggiungere.
    case "url_secret":
      return {};
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Esegue la POST verso l'endpoint dell'agenzia.
 *
 * Ritenta solo su errori transitori: un 4xx dal gestionale è deterministico e
 * ritentarlo produrrebbe solo altri tre errori identici.
 */
export async function postToWebhook(
  url: string,
  provider: CrmProvider,
  auth: CrmAuth,
  payload: unknown
): Promise<CrmDeliveryResult> {
  const safe = parsePublicHttpUrl(url);
  if (!safe.ok) {
    return { ok: false, error: "URL non valido o non raggiungibile dall'esterno." };
  }

  // Il vincolo sull'host si riverifica alla consegna, non solo al salvataggio:
  // l'elenco degli host di un provider può cambiare, e un URL salvato mesi fa
  // non deve poter spedire i dati dei clienti a un dominio non più previsto.
  if (!isHostAllowed(provider, safe.url.hostname)) {
    return {
      ok: false,
      error: `L'indirizzo non appartiene a ${provider.name}. Controlla l'URL nelle impostazioni.`,
    };
  }

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "PropertyTech-Webhook/1.0",
    ...buildAuthHeaders(provider, auth, body),
  };

  let last: CrmDeliveryResult = { ok: false, error: "Consegna non riuscita." };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(safe.url, {
        method: "POST",
        headers,
        body,
        redirect: "error",
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });

      if (response.ok) return { ok: true, status: response.status };

      last = {
        ok: false,
        status: response.status,
        // Un 401/403 è quasi sempre una credenziale sbagliata o scaduta, ed è
        // l'errore più frequente in fase di configurazione: dirlo evita che
        // l'agente vada a cercare il problema nell'URL.
        error:
          response.status === 401 || response.status === 403
            ? `${provider.name} ha rifiutato le credenziali (${response.status}). Controlla la chiave API.`
            : `${provider.name} ha risposto ${response.status}.`,
      };

      if (!isRetryableStatus(response.status)) return last;
    } catch {
      last = { ok: false, error: "Endpoint non raggiungibile o troppo lento a rispondere." };
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 2 ** (attempt - 1) * 400));
    }
  }

  return last;
}

/**
 * Inoltra un lead al gestionale dell'agenzia, se l'integrazione è configurata.
 *
 * Non lancia mai: è un'operazione accessoria al flusso di qualificazione. Se il
 * gestionale è irraggiungibile, la conversazione WhatsApp deve proseguire e il
 * lead restare in pipeline — l'agente lo esporta poi in CSV o lo reinvia a mano
 * dalla scheda.
 */
export async function deliverLeadToCrm(
  lead: Lead,
  event: CrmEvent
): Promise<CrmDeliveryResult> {
  const organization = await prisma.organization.findUnique({
    where: { id: lead.organizationId },
    select: {
      agencyName: true,
      crmWebhookUrl: true,
      crmWebhookSecret: true,
      crmProvider: true,
      crmAuthToken: true,
      crmAuthUser: true,
      crmFieldMap: true,
    },
  });

  if (!organization?.crmWebhookUrl) {
    return { ok: false, error: "Integrazione gestionale non configurata." };
  }

  const provider = getProvider(organization.crmProvider);
  const fieldMap = resolveFieldMap(provider, organization.crmFieldMap);

  const result = await postToWebhook(
    organization.crmWebhookUrl,
    provider,
    {
      signingSecret: organization.crmWebhookSecret,
      // `null` quando la chiave non è decifrabile — chiave di cifratura
      // cambiata, dato corrotto. Si traduce in un rifiuto del gestionale con
      // messaggio chiaro, non in un errore incomprensibile.
      token: organization.crmAuthToken ? decryptSecret(organization.crmAuthToken) : null,
      user: organization.crmAuthUser,
    },
    buildLeadPayload(lead, event, organization.agencyName, provider, fieldMap)
  );

  if (result.ok) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { crmDeliveredAt: new Date() },
    });
  } else {
    console.error("[integrations/crm-webhook] Consegna non riuscita", {
      leadId: lead.id,
      organizationId: lead.organizationId,
      status: result.status,
    });
  }

  return result;
}
