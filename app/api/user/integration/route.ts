import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parsePublicHttpUrl, UNSAFE_URL_MESSAGES } from "@/lib/net/safe-url";
import { generateWebhookSecret, postToWebhook } from "@/lib/integrations/crm-webhook";
import { encryptSecret, decryptSecret, maskSecret, isEncryptionAvailable } from "@/lib/crypto/secrets";
import {
  CRM_PROVIDER_IDS,
  getProvider,
  isHostAllowed,
  LEAD_FIELD_KEYS,
  needsCredential,
  resolveFieldMap,
  type CrmProviderId,
  type LeadFieldKey,
} from "@/lib/integrations/providers";

/** Anticipi proposti dalla UI: il giorno prima, oppure poco prima della visita. */
const ALLOWED_REMINDER_HOURS = [1, 2, 3, 6, 12, 24, 48] as const;

/** Mappatura: solo le chiavi note, valori corti come un nome di campo. */
const fieldMapSchema = z
  .object(
    Object.fromEntries(
      LEAD_FIELD_KEYS.map((key) => [key, z.string().trim().max(60).optional()])
    ) as Record<LeadFieldKey, z.ZodOptional<z.ZodString>>
  )
  .strict();

const integrationSchema = z.object({
  /** Stringa vuota o `null` disattiva l'integrazione. */
  crmWebhookUrl: z.string().trim().max(500).nullable().optional(),
  /** Direzione opposta: da qui importiamo gli annunci del gestionale. */
  crmListingImportUrl: z.string().trim().max(500).nullable().optional(),
  crmProvider: z.enum(CRM_PROVIDER_IDS as [CrmProviderId, ...CrmProviderId[]]).optional(),
  /**
   * Credenziale in chiaro dal browser: viaggia solo su HTTPS e viene cifrata
   * prima di toccare il database. Stringa vuota = rimuovi la credenziale.
   */
  crmAuthToken: z.string().trim().max(500).nullable().optional(),
  crmAuthUser: z.string().trim().max(200).nullable().optional(),
  crmFieldMap: fieldMapSchema.nullable().optional(),
  reminderEnabled: z.boolean().optional(),
  reminderHoursBefore: z
    .number()
    .int()
    .refine((value) => (ALLOWED_REMINDER_HOURS as readonly number[]).includes(value), {
      message: "Anticipo non ammesso.",
    })
    .optional(),
});

interface IntegrationView {
  crmWebhookUrl: string | null;
  crmWebhookSecret: string | null;
  crmListingImportUrl: string | null;
  crmListingImportedAt: string | null;
  crmProvider: CrmProviderId;
  /** Solo la coda della chiave: il valore in chiaro non torna mai al browser. */
  crmAuthTokenMask: string | null;
  crmAuthUser: string | null;
  crmFieldMap: Record<LeadFieldKey, string>;
  reminderEnabled: boolean;
  reminderHoursBefore: number;
}

async function readIntegration(organizationId: string): Promise<IntegrationView | null> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      crmWebhookUrl: true,
      crmWebhookSecret: true,
      crmListingImportUrl: true,
      crmListingImportedAt: true,
      crmProvider: true,
      crmAuthToken: true,
      crmAuthUser: true,
      crmFieldMap: true,
      whatsAppConfig: { select: { reminderEnabled: true, reminderHoursBefore: true } },
    },
  });

  if (!organization) return null;

  const provider = getProvider(organization.crmProvider);
  // Si decifra solo per mostrarne le ultime quattro cifre: serve a far
  // riconoscere all'agente *quale* chiave ha configurato, senza rimandarla
  // indietro. Se non è decifrabile, la si segnala come da riconfigurare.
  const token = organization.crmAuthToken ? decryptSecret(organization.crmAuthToken) : null;

  return {
    crmWebhookUrl: organization.crmWebhookUrl,
    crmWebhookSecret: organization.crmWebhookSecret,
    crmListingImportUrl: organization.crmListingImportUrl,
    crmListingImportedAt: organization.crmListingImportedAt?.toISOString() ?? null,
    crmProvider: provider.id,
    crmAuthTokenMask: organization.crmAuthToken
      ? token
        ? maskSecret(token)
        : "non leggibile — reinseriscila"
      : null,
    crmAuthUser: organization.crmAuthUser,
    crmFieldMap: resolveFieldMap(provider, organization.crmFieldMap),
    // I default rispecchiano quelli dello schema: un'agenzia che non ha ancora
    // collegato WhatsApp deve comunque vedere l'impostazione che avrà.
    reminderEnabled: organization.whatsAppConfig?.reminderEnabled ?? true,
    reminderHoursBefore: organization.whatsAppConfig?.reminderHoursBefore ?? 24,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const integration = await readIntegration(session.user.organizationId);
  if (!integration) {
    return NextResponse.json({ error: "organization_not_found" }, { status: 404 });
  }

  return NextResponse.json(integration);
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  const body = await request.json().catch(() => null);
  const parsed = integrationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", message: parsed.error.issues[0]?.message ?? "Dati non validi." },
      { status: 400 }
    );
  }

  const {
    crmWebhookUrl,
    crmListingImportUrl,
    crmProvider,
    crmAuthToken,
    crmAuthUser,
    crmFieldMap,
    reminderEnabled,
    reminderHoursBefore,
  } = parsed.data;

  const organizationData: {
    crmWebhookUrl?: string | null;
    crmWebhookSecret?: string;
    crmListingImportUrl?: string | null;
    crmProvider?: string;
    crmAuthToken?: string | null;
    crmAuthUser?: string | null;
    // `Prisma.DbNull` e non `null`: per una colonna Json, Prisma distingue il
    // NULL della colonna dal valore JSON `null`, e solo il primo significa
    // "torna al preset del provider".
    crmFieldMap?: Record<string, string> | typeof Prisma.DbNull;
  } = {};

  // Il provider serve anche a validare l'URL: va risolto prima, usando quello
  // che sta per essere salvato e non quello ancora in archivio.
  const current = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { crmWebhookSecret: true, crmProvider: true },
  });

  const provider = getProvider(crmProvider ?? current?.crmProvider);

  if (crmProvider !== undefined) {
    organizationData.crmProvider = crmProvider;
  }

  if (crmWebhookUrl !== undefined) {
    if (!crmWebhookUrl) {
      organizationData.crmWebhookUrl = null;
    } else {
      // La validazione SSRF avviene già qui, non solo alla consegna: salvare un
      // URL interno significherebbe conservare un bersaglio pronto all'uso.
      const safe = parsePublicHttpUrl(crmWebhookUrl);
      if (!safe.ok) {
        return NextResponse.json(
          { error: "invalid_webhook_url", message: UNSAFE_URL_MESSAGES[safe.reason] },
          { status: 400 }
        );
      }

      // Per i servizi con dominio noto — Zapier, Make — l'host è vincolato:
      // un URL incollato male manderebbe nomi e telefoni dei clienti a un
      // host qualsiasi, e la firma HMAC lì non c'è a fare da rete.
      if (!isHostAllowed(provider, safe.url.hostname)) {
        return NextResponse.json(
          {
            error: "host_not_allowed",
            message: `Per ${provider.name} l'indirizzo deve essere su ${provider.allowedHosts?.join(" o ")}.`,
          },
          { status: 400 }
        );
      }

      organizationData.crmWebhookUrl = safe.url.toString();

      // Il segreto si genera alla prima configurazione e poi resta stabile:
      // rigenerarlo a ogni salvataggio invaliderebbe la verifica di firma già
      // configurata sul gestionale.
      if (!current?.crmWebhookSecret) {
        organizationData.crmWebhookSecret = generateWebhookSecret();
      }
    }
  }

  if (crmListingImportUrl !== undefined) {
    if (!crmListingImportUrl) {
      organizationData.crmListingImportUrl = null;
    } else {
      // Stessa guardia SSRF dell'endpoint di consegna: un URL interno qui
      // significherebbe far leggere al nostro server un bersaglio a scelta
      // dell'agente, con tanto di chiave API in header.
      const safeImport = parsePublicHttpUrl(crmListingImportUrl);
      if (!safeImport.ok) {
        return NextResponse.json(
          { error: "invalid_import_url", message: UNSAFE_URL_MESSAGES[safeImport.reason] },
          { status: 400 }
        );
      }

      if (!isHostAllowed(provider, safeImport.url.hostname)) {
        return NextResponse.json(
          {
            error: "host_not_allowed",
            message: `Per ${provider.name} l'indirizzo deve essere su ${provider.allowedHosts?.join(" o ")}.`,
          },
          { status: 400 }
        );
      }

      organizationData.crmListingImportUrl = safeImport.url.toString();
    }
  }

  if (crmAuthToken !== undefined) {
    if (!crmAuthToken) {
      organizationData.crmAuthToken = null;
    } else if (!isEncryptionAvailable()) {
      // Meglio rifiutare che salvare in chiaro una chiave che apre il
      // gestionale dell'agenzia.
      return NextResponse.json(
        {
          error: "encryption_unavailable",
          message: "Cifratura non disponibile sul server: la credenziale non è stata salvata.",
        },
        { status: 503 }
      );
    } else {
      organizationData.crmAuthToken = encryptSecret(crmAuthToken);
    }
  }

  if (crmAuthUser !== undefined) {
    organizationData.crmAuthUser = crmAuthUser || null;
  }

  if (crmFieldMap !== undefined) {
    // `null` riporta al preset del provider. Altrimenti si salva la mappatura
    // già normalizzata, così ciò che sta nel database è ciò che si spedisce.
    organizationData.crmFieldMap = crmFieldMap
      ? resolveFieldMap(provider, crmFieldMap)
      : Prisma.DbNull;
  }

  if (Object.keys(organizationData).length > 0) {
    await prisma.organization.update({ where: { id: organizationId }, data: organizationData });
  }

  if (reminderEnabled !== undefined || reminderHoursBefore !== undefined) {
    const reminderData = {
      ...(reminderEnabled !== undefined && { reminderEnabled }),
      ...(reminderHoursBefore !== undefined && { reminderHoursBefore }),
    };

    // upsert: un'agenzia può impostare i promemoria prima ancora di collegare
    // WhatsApp, e la preferenza deve sopravvivere fino alla connessione.
    await prisma.whatsAppConfig.upsert({
      where: { organizationId },
      create: { organizationId, ...reminderData },
      update: reminderData,
    });
  }

  const integration = await readIntegration(organizationId);
  return NextResponse.json(integration);
}

/**
 * Valori del lead di prova.
 *
 * Riconoscibili come finti a colpo d'occhio: un test che finisce per sbaglio
 * nel gestionale non deve somigliare a un cliente vero, o qualcuno lo
 * richiamerà.
 */
const SAMPLE_VALUES: Record<LeadFieldKey, unknown> = {
  nome: "PROVA — Mario Rossi (test)",
  telefono: "+390000000000",
  fonte: "SITO_WEB",
  immobile: "TEST-000",
  stato: "QUALIFIED",
  budget: "200000",
  mutuo: true,
  deveVenderePrima: false,
  tempistica: "3 mesi",
  appuntamento: null,
  appuntamentoConfermato: false,
  immobiliPosseduti: 1,
  categoriaVenditore: "SINGLE_SELLER",
  creatoIl: new Date().toISOString(),
};

/** Invia un payload di prova all'endpoint configurato, per verificarlo subito. */
export async function POST() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
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
    return NextResponse.json(
      { error: "not_configured", message: "Salva prima un indirizzo webhook." },
      { status: 400 }
    );
  }

  const provider = getProvider(organization.crmProvider);
  const token = organization.crmAuthToken ? decryptSecret(organization.crmAuthToken) : null;

  // Meglio dirlo prima di chiamare: senza credenziale il gestionale
  // risponderebbe 401 e l'agente andrebbe a cercare il problema nell'URL.
  if (needsCredential(provider) && !token) {
    return NextResponse.json(
      {
        ok: false,
        error: `${provider.name} richiede una chiave API. Inseriscila e salva, poi riprova il test.`,
      },
      { status: 400 }
    );
  }

  const fieldMap = resolveFieldMap(provider, organization.crmFieldMap);

  // Il test spedisce un lead finto con la mappatura reale: verificare con un
  // corpo diverso da quello di produzione proverebbe solo che l'endpoint
  // risponde, non che accetta i campi che gli manderemo davvero.
  const sample: Record<string, unknown> = {
    event: "ping",
    sentAt: new Date().toISOString(),
    agency: organization.agencyName,
    message: "Test di connessione da PropertyTech.",
  };

  for (const [key, target] of Object.entries(fieldMap)) {
    if (!target) continue;
    sample[target] = SAMPLE_VALUES[key as LeadFieldKey] ?? "test";
  }

  const result = await postToWebhook(organization.crmWebhookUrl, provider, {
    signingSecret: organization.crmWebhookSecret,
    token,
    user: organization.crmAuthUser,
  }, sample);

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
