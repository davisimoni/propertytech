import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkUsageLimit } from "@/lib/usage";
import { inboundLeadSchema, normalizePhone } from "@/lib/whatsapp/types";
import { startConversation } from "@/lib/whatsapp/conversation";
import { hasUsableAccessToken } from "@/lib/whatsapp/credentials";

/**
 * Ingaggio lead dai portali immobiliari (Immobiliare.it, Idealista, Casa.it).
 *
 * Rotta pubblica: l'autenticazione è il token d'ingestione dell'agenzia, passato
 * come `Authorization: Bearer <token>` oppure `?token=`. Non usa la sessione
 * NextAuth perché il chiamante è un sistema esterno, non un browser.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const inboundToken = bearer || url.searchParams.get("token");

  if (!inboundToken) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const config = await prisma.whatsAppConfig.findUnique({
    where: { inboundToken },
    include: { organization: true },
  });

  if (!config) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = inboundLeadSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { clientName, clientPhone, portalSource, propertyRef, budget } = parsed.data;
  const normalizedPhone = normalizePhone(clientPhone);
  const organizationId = config.organizationId;

  const existing = await prisma.lead.findUnique({
    where: { organizationId_clientPhone: { organizationId, clientPhone: normalizedPhone } },
  });

  // Un contatto che ha revocato il consenso non viene mai ri-ingaggiato,
  // nemmeno da una nuova richiesta portale (CLAUDE.md §5).
  if (existing?.qualificationStatus === "OPT_OUT") {
    return NextResponse.json({ status: "opt_out", leadId: existing.id }, { status: 200 });
  }

  const lead = existing
    ? await prisma.lead.update({
        where: { id: existing.id },
        data: { propertyRef, portalSource, clientName, budget: budget ?? existing.budget },
      })
    : await prisma.lead.create({
        data: {
          organizationId,
          clientName,
          clientPhone: normalizedPhone,
          portalSource,
          propertyRef,
          budget: budget ?? null,
          qualificationStatus: "PENDING",
        },
      });

  // Verifica crediti DOPO aver persistito il lead: se i crediti sono esauriti
  // il lead resta PENDING e visibile in dashboard, così l'agenzia non lo perde
  // e può recuperarlo dopo l'upgrade.
  const limitResponse = await checkUsageLimit(organizationId, "whatsapp");
  if (limitResponse) {
    return limitResponse;
  }

  // `hasUsableAccessToken` e non la sola presenza: un token non decifrabile
  // farebbe passare il controllo e fallire l'invio subito dopo.
  if (!config.isConnected || !hasUsableAccessToken(config.metaAccessToken) || !config.metaPhoneAccountId) {
    return NextResponse.json(
      { error: "whatsapp_not_connected", leadId: lead.id, status: "PENDING" },
      { status: 409 }
    );
  }

  try {
    await startConversation(lead, config, config.organization.agencyName);
  } catch (error) {
    console.error("[api/whatsapp/inbound-lead] Engagement failed", { leadId: lead.id, error });
    return NextResponse.json(
      { error: "engagement_failed", leadId: lead.id, status: "PENDING" },
      { status: 502 }
    );
  }

  return NextResponse.json({ status: "IN_PROGRESS", leadId: lead.id }, { status: 201 });
}
