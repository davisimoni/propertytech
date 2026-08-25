import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { encryptAccessToken } from "@/lib/whatsapp/credentials";
import { getOrCreateWhatsAppConfig, toPublicWhatsAppConfig } from "@/lib/whatsapp/config-view";
import { isWhatsAppProviderId, WHATSAPP_PROVIDER_IDS, type WhatsAppProviderId } from "@/lib/whatsapp/provider";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const config = await getOrCreateWhatsAppConfig(session.user.organizationId);
  return NextResponse.json(toPublicWhatsAppConfig(config));
}

const updateConfigSchema = z.object({
  provider: z.enum(WHATSAPP_PROVIDER_IDS as [WhatsAppProviderId, ...WhatsAppProviderId[]]).optional(),
  disconnect: z.boolean().optional(),

  // --- Meta ---
  phoneNumber: z.string().min(6).max(20).optional(),
  metaAccessToken: z.string().min(10).optional(),
  metaPhoneAccountId: z.string().min(3).optional(),

  // --- Twilio ---
  twilioAccountSid: z.string().min(10).max(64).optional(),
  twilioAuthToken: z.string().min(10).max(200).optional(),
  twilioWhatsAppNumber: z
    .string()
    .regex(/^whatsapp:\+[1-9]\d{6,14}$/, 'Formato atteso: whatsapp:+1415…')
    .optional(),

  // --- Webhook generico ---
  genericSendUrl: z.string().trim().url().max(500).optional(),
  genericAuthToken: z.string().max(500).optional(),
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

  const current = await getOrCreateWhatsAppConfig(organizationId);
  const targetProvider: WhatsAppProviderId = parsed.data.provider ?? (isWhatsAppProviderId(current.provider) ? current.provider : "meta");

  if (parsed.data.disconnect) {
    // Sconnette solo il provider attivo: cambiare fornitore non deve
    // richiedere di ripulire a mano i campi di quello precedente.
    const cleared = await prisma.whatsAppConfig.update({
      where: { organizationId },
      data: {
        isConnected: false,
        ...(targetProvider === "meta" && {
          metaAccessToken: null,
          metaPhoneAccountId: null,
          phoneNumber: null,
        }),
        ...(targetProvider === "twilio" && {
          twilioAccountSid: null,
          twilioAuthToken: null,
          twilioWhatsAppNumber: null,
        }),
        ...(targetProvider === "generic" && {
          genericSendUrl: null,
          genericAuthToken: null,
        }),
      },
    });
    return NextResponse.json(toPublicWhatsAppConfig(cleared));
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.provider) data.provider = parsed.data.provider;

  if (targetProvider === "meta") {
    const { phoneNumber, metaAccessToken, metaPhoneAccountId } = parsed.data;

    if (metaAccessToken || metaPhoneAccountId) {
      if (!metaAccessToken || !metaPhoneAccountId) {
        return NextResponse.json(
          { error: "missing_credentials", message: "Token Meta e Phone Account ID sono entrambi obbligatori." },
          { status: 400 }
        );
      }

      let encryptedToken: string;
      try {
        encryptedToken = encryptAccessToken(metaAccessToken);
      } catch {
        return NextResponse.json(
          { error: "encryption_unavailable", message: "Cifratura non disponibile sul server: il token non è stato salvato." },
          { status: 503 }
        );
      }

      data.metaAccessToken = encryptedToken;
      data.metaPhoneAccountId = metaPhoneAccountId;
      data.phoneNumber = phoneNumber ?? null;
      data.isConnected = true;
    }
  } else if (targetProvider === "twilio") {
    const { twilioAccountSid, twilioAuthToken, twilioWhatsAppNumber } = parsed.data;

    if (twilioAccountSid || twilioAuthToken || twilioWhatsAppNumber) {
      if (!twilioAccountSid || !twilioAuthToken || !twilioWhatsAppNumber) {
        return NextResponse.json(
          {
            error: "missing_credentials",
            message: "Account SID, Auth Token e numero WhatsApp Twilio sono tutti obbligatori.",
          },
          { status: 400 }
        );
      }

      let encryptedToken: string;
      try {
        encryptedToken = encryptAccessToken(twilioAuthToken);
      } catch {
        return NextResponse.json(
          { error: "encryption_unavailable", message: "Cifratura non disponibile sul server: il token non è stato salvato." },
          { status: 503 }
        );
      }

      data.twilioAccountSid = twilioAccountSid;
      data.twilioAuthToken = encryptedToken;
      data.twilioWhatsAppNumber = twilioWhatsAppNumber;
      data.isConnected = true;
    }
  } else if (targetProvider === "generic") {
    const { genericSendUrl, genericAuthToken } = parsed.data;

    if (genericSendUrl) {
      data.genericSendUrl = genericSendUrl;
      data.isConnected = true;
    }

    if (genericAuthToken) {
      try {
        data.genericAuthToken = encryptAccessToken(genericAuthToken);
      } catch {
        return NextResponse.json(
          { error: "encryption_unavailable", message: "Cifratura non disponibile sul server: il token non è stato salvato." },
          { status: 503 }
        );
      }
    }
  }

  const updated = await prisma.whatsAppConfig.update({ where: { organizationId }, data });
  return NextResponse.json(toPublicWhatsAppConfig(updated));
}
