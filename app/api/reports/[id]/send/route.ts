import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkFeatureAccess } from "@/lib/feature-access";
import { sendWhatsAppMessage, WhatsAppSendError } from "@/lib/whatsapp/client";
import { storedReportForSendingSchema } from "@/lib/ai/report-schema";
import { AI_DISCLAIMER_SHORT } from "@/lib/compliance";
import { decryptAccessToken } from "@/lib/whatsapp/credentials";

const sendSchema = z.object({
  sellerPhone: z.string().min(6).max(20).optional(),
});

/** Invia al proprietario il messaggio di sintesi del report via WhatsApp. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;

  const accessResponse = await checkFeatureAccess(organizationId, "voiceSellerReporting");
  if (accessResponse) {
    return accessResponse;
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = sendSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // findFirst con organizationId anziché findUnique per id: impedisce di
  // leggere il report di un'altra agenzia indovinandone l'id.
  const report = await prisma.voiceReport.findFirst({
    where: { id, organizationId },
  });

  if (!report) {
    return NextResponse.json({ error: "report_not_found" }, { status: 404 });
  }

  const sellerPhone = parsed.data.sellerPhone ?? report.sellerPhone;
  if (!sellerPhone) {
    return NextResponse.json({ error: "missing_seller_phone" }, { status: 400 });
  }

  const config = await prisma.whatsAppConfig.findUnique({ where: { organizationId } });
  // Il token si decifra qui: se non è utilizzabile la connessione va rifatta,
  // ed è lo stesso esito di una connessione mai configurata.
  const accessToken = decryptAccessToken(config?.metaAccessToken);
  if (!config?.isConnected || !accessToken || !config.metaPhoneAccountId) {
    return NextResponse.json({ error: "whatsapp_not_connected" }, { status: 409 });
  }

  // Solo il campo che serve davvero all'invio: un report salvato prima
  // dell'introduzione di `agentSummary` resta inviabile.
  const content = storedReportForSendingSchema.safeParse(report.report);
  if (!content.success) {
    console.error("[api/reports/send] Stored report failed schema validation", { reportId: id });
    return NextResponse.json({ error: "invalid_report" }, { status: 422 });
  }

  // Il disclaimer è aggiunto qui e non nel prompt: così è garantito su ogni
  // invio, senza dipendere dal fatto che il modello lo abbia incluso.
  const messageWithDisclaimer = `${content.data.sellerMessage}\n\n---\n${AI_DISCLAIMER_SHORT}`;

  try {
    await sendWhatsAppMessage(
      { metaAccessToken: accessToken, metaPhoneAccountId: config.metaPhoneAccountId },
      sellerPhone,
      messageWithDisclaimer
    );
  } catch (error) {
    if (error instanceof WhatsAppSendError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 502 });
    }
    console.error("[api/reports/send] Unexpected send failure", { reportId: id, error });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  await prisma.voiceReport.update({
    where: { id },
    data: { sentToSeller: true, sentAt: new Date(), sellerPhone },
  });

  return NextResponse.json({ sent: true });
}
