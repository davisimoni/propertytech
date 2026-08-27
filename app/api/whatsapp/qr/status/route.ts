import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fetchQrStatus, QrServiceError } from "@/lib/whatsapp/qr-service";

/**
 * Stato della sessione, interrogato dal polling mentre il QR è a schermo.
 *
 * Interroga il microservizio invece di limitarsi a leggere il database: il
 * webhook di conferma può arrivare in ritardo o perdersi, e in quel caso
 * l'agente resterebbe davanti a un QR già inquadrato senza vedere nulla
 * cambiare. Quando il servizio dice "connesso", questa rotta allinea anche il
 * database — così il collegamento regge pure se il webhook non arriva mai.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  const config = await prisma.whatsAppConfig.findUnique({
    where: { organizationId },
    select: { qrSessionId: true, isConnected: true, phoneNumber: true },
  });

  if (!config?.qrSessionId) {
    return NextResponse.json({ status: "disconnected", phoneNumber: null });
  }

  try {
    const result = await fetchQrStatus(config.qrSessionId);

    const isNowConnected = result.status === "connected";
    const phoneChanged = result.phoneNumber !== null && result.phoneNumber !== config.phoneNumber;

    if (isNowConnected !== config.isConnected || phoneChanged) {
      await prisma.whatsAppConfig.update({
        where: { organizationId },
        data: {
          isConnected: isNowConnected,
          phoneNumber: result.phoneNumber ?? config.phoneNumber,
          ...(isNowConnected && !config.isConnected ? { qrConnectedAt: new Date() } : {}),
        },
      });
    }

    return NextResponse.json({ status: result.status, phoneNumber: result.phoneNumber });
  } catch (error) {
    if (error instanceof QrServiceError) {
      // Lo stato noto è meglio di un errore: se il servizio non risponde per
      // un istante, l'interfaccia continua a mostrare l'ultimo esito valido
      // invece di far lampeggiare "disconnesso" a ogni giro di polling.
      console.error("[api/whatsapp/qr/status] Servizio non raggiungibile", { code: error.code });
      return NextResponse.json({
        status: config.isConnected ? "connected" : "pending",
        phoneNumber: config.phoneNumber,
        degraded: true,
      });
    }

    console.error("[api/whatsapp/qr/status] Errore inatteso", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
