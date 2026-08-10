import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildWhatsAppQrLink, QR_LINK_MESSAGES } from "@/lib/whatsapp/qr-link";

/**
 * QR dell'agenzia: chi lo inquadra apre WhatsApp sul numero dell'agenzia con
 * un messaggio già scritto. Il bot risponde, qualifica il contatto e la
 * notizia entra in pipeline.
 *
 * L'immagine è generata dal server a partire dal numero salvato in
 * `WhatsAppConfig`, non da un parametro del client: così il codice stampato
 * non può puntare a un numero diverso da quello davvero collegato.
 */

/** Correzione d'errore alta: il QR finisce su vetrine e cartelli, dove si
 *  sporca, si scolorisce e viene inquadrato di sbieco. */
const ERROR_CORRECTION = "H" as const;

/** Lato in pixel del PNG: abbastanza grande da reggere la stampa A5. */
const PNG_SIZE = 1024;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const format = params.get("format") === "png" ? "png" : "svg";
  const message = params.get("message");

  const config = await prisma.whatsAppConfig.findUnique({
    where: { organizationId: session.user.organizationId },
    select: { phoneNumber: true },
  });

  const link = buildWhatsAppQrLink(config?.phoneNumber, message);

  if (!link.ok) {
    return NextResponse.json(
      { error: link.reason, message: QR_LINK_MESSAGES[link.reason] },
      { status: 409 }
    );
  }

  try {
    if (format === "png") {
      const buffer = await QRCode.toBuffer(link.url, {
        type: "png",
        errorCorrectionLevel: ERROR_CORRECTION,
        width: PNG_SIZE,
        margin: 2,
      });

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": 'attachment; filename="qr-whatsapp-agenzia.png"',
          "Cache-Control": "no-store",
        },
      });
    }

    const svg = await QRCode.toString(link.url, {
      type: "svg",
      errorCorrectionLevel: ERROR_CORRECTION,
      margin: 2,
    });

    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        // L'anteprima cambia a ogni modifica del messaggio: non va messa in cache.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[api/whatsapp/qr] Generazione non riuscita", error);
    return NextResponse.json({ error: "qr_generation_failed" }, { status: 500 });
  }
}
