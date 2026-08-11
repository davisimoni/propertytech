import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parsePublicHttpUrl } from "@/lib/net/safe-url";
import { decryptSecret } from "@/lib/crypto/secrets";
import { getProvider, needsCredential, type CrmProvider } from "@/lib/integrations/providers";
import { isContractType, isEnergyClass, isPropertyType } from "@/lib/listings/property-fields";

/**
 * Import annunci dal gestionale (direzione opposta a crm-webhook.ts: lì un
 * lead ESCE verso il gestionale, qui gli immobili ENTRANO in PropertyTech).
 *
 * **Stesso principio di onestà di `lib/listings/portal-xml.ts` e
 * `lib/integrations/providers.ts`, applicato al senso inverso**: non
 * conosciamo il tracciato JSON esatto di RealGest, Miogest o degli altri
 * gestionali non verificati. Il contratto qui sotto è quello che
 * PropertyTech si aspetta — se il gestionale espone un formato diverso,
 * serve un passaggio di traduzione (uno script dell'agenzia, uno scenario
 * Zapier/Make, o un adattatore dedicato una volta confermato il contratto
 * reale col fornitore) prima che i dati arrivino qui.
 */

const IMPORT_TIMEOUT_MS = 15_000;
const MAX_LISTINGS_PER_SYNC = 500;

export interface ListingImportResult {
  ok: boolean;
  imported?: number;
  skipped?: number;
  error?: string;
}

/** Un immobile così come questo importatore si aspetta di riceverlo. */
const remoteListingSchema = z.object({
  reference: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(200),
  contract: z.string().refine(isContractType, "contract non valido"),
  type: z.string().refine(isPropertyType, "type non valido"),
  comune: z.string().trim().min(1).max(120),
  provincia: z.string().trim().max(40).nullable().optional(),
  zona: z.string().trim().max(120).nullable().optional(),
  indirizzo: z.string().trim().max(200).nullable().optional(),
  priceEur: z.number().int().positive().max(100_000_000),
  squareMeters: z.number().int().positive().max(100_000),
  rooms: z.number().int().min(0).max(100).nullable().optional(),
  bathrooms: z.number().int().min(0).max(50).nullable().optional(),
  floor: z.string().trim().max(20).nullable().optional(),
  energyClass: z
    .string()
    .refine(isEnergyClass, "energyClass non valida")
    .nullable()
    .optional(),
  description: z.string().trim().max(4000).nullable().optional(),
});

const remoteFeedSchema = z.object({
  listings: z.array(remoteListingSchema).max(MAX_LISTINGS_PER_SYNC),
});

function buildReadHeaders(
  provider: CrmProvider,
  token: string | null,
  user: string | null
): Record<string, string> {
  switch (provider.auth) {
    case "bearer":
      return token ? { Authorization: `Bearer ${token}` } : {};
    case "api_key_header":
      return token && provider.authHeaderName ? { [provider.authHeaderName]: token } : {};
    case "basic":
      return token
        ? { Authorization: `Basic ${Buffer.from(`${user ?? ""}:${token}`).toString("base64")}` }
        : {};
    // hmac/url_secret sono schemi pensati per RICEVERE da noi (Zapier, Make,
    // il nostro stesso webhook): non hanno senso per una GET di lettura.
    default:
      return {};
  }
}

/**
 * Importa gli annunci dal gestionale collegato e li allinea in `Property`
 * tramite upsert su `[organizationId, reference]`: rilanciare la sincronizzazione
 * aggiorna gli immobili già noti invece di duplicarli.
 *
 * Non lancia mai: un gestionale irraggiungibile o che risponde con un
 * formato inatteso non deve far fallire il resto della dashboard, esattamente
 * come `deliverLeadToCrm` per la direzione opposta.
 */
export async function importListingsFromCrm(organizationId: string): Promise<ListingImportResult> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      crmListingImportUrl: true,
      crmProvider: true,
      crmAuthToken: true,
      crmAuthUser: true,
    },
  });

  if (!organization?.crmListingImportUrl) {
    return { ok: false, error: "Import annunci non configurato." };
  }

  const provider = getProvider(organization.crmProvider);

  if (!needsCredential(provider)) {
    // Zapier/Make/webhook generico non hanno un "portafoglio immobili" da
    // leggere: sono canali di consegna, non gestionali con un'API propria.
    return { ok: false, error: `${provider.name} non supporta l'importazione annunci.` };
  }

  const safe = parsePublicHttpUrl(organization.crmListingImportUrl);
  if (!safe.ok) {
    return { ok: false, error: "Indirizzo di importazione non valido o non raggiungibile." };
  }

  const token = organization.crmAuthToken ? decryptSecret(organization.crmAuthToken) : null;
  if (!token) {
    return {
      ok: false,
      error: `${provider.name} richiede una chiave API. Configurala nel collegamento al gestionale.`,
    };
  }

  let raw: unknown;
  try {
    const response = await fetch(safe.url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "PropertyTech-ListingImport/1.0",
        ...buildReadHeaders(provider, token, organization.crmAuthUser),
      },
      redirect: "error",
      signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 401 || response.status === 403
            ? `${provider.name} ha rifiutato le credenziali (${response.status}).`
            : `${provider.name} ha risposto ${response.status}.`,
      };
    }

    raw = await response.json();
  } catch {
    return { ok: false, error: "Endpoint non raggiungibile o troppo lento a rispondere." };
  }

  // Alcuni gestionali restituiscono direttamente un array, altri lo
  // annidano: si accettano entrambe le forme prima di validare.
  const candidate = Array.isArray(raw) ? { listings: raw } : raw;
  const parsed = remoteFeedSchema.safeParse(candidate);

  if (!parsed.success) {
    return {
      ok: false,
      error:
        "Formato non riconosciuto. Il gestionale deve restituire un array di annunci con i campi attesi da PropertyTech (vedi documentazione integrazioni).",
    };
  }

  let imported = 0;
  let skipped = 0;

  for (const listing of parsed.data.listings) {
    try {
      await prisma.property.upsert({
        where: { organizationId_reference: { organizationId, reference: listing.reference } },
        create: {
          organizationId,
          reference: listing.reference,
          title: listing.title,
          contract: listing.contract as never,
          type: listing.type as never,
          comune: listing.comune,
          provincia: listing.provincia || null,
          zona: listing.zona || null,
          indirizzo: listing.indirizzo || null,
          priceEur: listing.priceEur,
          squareMeters: listing.squareMeters,
          rooms: listing.rooms ?? null,
          bathrooms: listing.bathrooms ?? null,
          floor: listing.floor || null,
          energyClass: (listing.energyClass || null) as never,
          description: listing.description || null,
        },
        update: {
          title: listing.title,
          contract: listing.contract as never,
          type: listing.type as never,
          comune: listing.comune,
          provincia: listing.provincia || null,
          zona: listing.zona || null,
          indirizzo: listing.indirizzo || null,
          priceEur: listing.priceEur,
          squareMeters: listing.squareMeters,
          rooms: listing.rooms ?? null,
          bathrooms: listing.bathrooms ?? null,
          floor: listing.floor || null,
          energyClass: (listing.energyClass || null) as never,
          // La descrizione generata dall'AI (Modulo 3) non viene sovrascritta
          // da un import: se il gestionale non ne manda una, si tiene la
          // nostra; se ne manda una, la sostituisce solo esplicitamente.
          ...(listing.description ? { description: listing.description } : {}),
        },
      });
      imported++;
    } catch (error) {
      console.error("[integrations/crm/listing-import] Upsert annuncio fallito", {
        organizationId,
        reference: listing.reference,
        error,
      });
      skipped++;
    }
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: { crmListingImportedAt: new Date() },
  });

  return { ok: true, imported, skipped };
}
