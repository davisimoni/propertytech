import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { encryptAccessToken, hasUsableAccessToken } from "@/lib/whatsapp/credentials";

/**
 * Il token d'ingestione e il verify token sono creati alla prima lettura, così
 * l'agenzia trova subito URL webhook ed email dedicata pronti da incollare nei
 * portali, prima ancora di connettere WhatsApp.
 */
async function getOrCreateConfig(organizationId: string) {
  return prisma.whatsAppConfig.upsert({
    where: { organizationId },
    create: { organizationId, webhookVerifyToken: crypto.randomUUID() },
    update: {},
  });
}

/** Non espone mai il token Meta: solo un flag di presenza. */
function toPublicConfig(config: Awaited<ReturnType<typeof getOrCreateConfig>>) {
  return {
    isConnected: config.isConnected,
    phoneNumber: config.phoneNumber,
    metaPhoneAccountId: config.metaPhoneAccountId,
    // Non `Boolean(...)`: un token presente ma non decifrabile mostrerebbe la
    // connessione a posto mentre ogni invio fallisce, e l'agenzia non avrebbe
    // modo di capire perché.
    hasAccessToken: hasUsableAccessToken(config.metaAccessToken),
    inboundToken: config.inboundToken,
    webhookVerifyToken: config.webhookVerifyToken,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const config = await getOrCreateConfig(session.user.organizationId);
  return NextResponse.json(toPublicConfig(config));
}

const updateConfigSchema = z.object({
  phoneNumber: z.string().min(6).max(20).optional(),
  metaAccessToken: z.string().min(10).optional(),
  metaPhoneAccountId: z.string().min(3).optional(),
  disconnect: z.boolean().optional(),
});

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  const body = await request.json().catch(() => null);
  const parsed = updateConfigSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  await getOrCreateConfig(organizationId);

  if (parsed.data.disconnect) {
    const cleared = await prisma.whatsAppConfig.update({
      where: { organizationId },
      data: {
        isConnected: false,
        metaAccessToken: null,
        metaPhoneAccountId: null,
        phoneNumber: null,
      },
    });
    return NextResponse.json(toPublicConfig(cleared));
  }

  const { phoneNumber, metaAccessToken, metaPhoneAccountId } = parsed.data;

  if (!metaAccessToken || !metaPhoneAccountId) {
    return NextResponse.json(
      { error: "missing_credentials", message: "Token Meta e Phone Account ID sono entrambi obbligatori." },
      { status: 400 }
    );
  }

  // Il token è cifrato prima di toccare il database: permette di inviare
  // messaggi a nome dell'agenzia, e in chiaro sarebbe leggibile da qualunque
  // copia del database.
  let encryptedToken: string;
  try {
    encryptedToken = encryptAccessToken(metaAccessToken);
  } catch {
    return NextResponse.json(
      {
        error: "encryption_unavailable",
        message: "Cifratura non disponibile sul server: il token non è stato salvato.",
      },
      { status: 503 }
    );
  }

  const updated = await prisma.whatsAppConfig.update({
    where: { organizationId },
    data: {
      phoneNumber: phoneNumber ?? null,
      metaAccessToken: encryptedToken,
      metaPhoneAccountId,
      isConnected: true,
    },
  });

  return NextResponse.json(toPublicConfig(updated));
}
