import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateWhatsAppConfig, toPublicWhatsAppConfig } from "@/lib/whatsapp/config-view";
import { isQrServiceConfigured, requestQrCode, QrServiceError } from "@/lib/whatsapp/qr-service";

/**
 * Genera il QR con cui l'agenzia abbina il proprio WhatsApp.
 *
 * ATTENZIONE — da non confondere con `/api/whatsapp/qr`, che è un'altra cosa:
 * quello produce il QR da stampare in vetrina, che i *clienti* inquadrano per
 * scrivere all'agenzia. Questo abbina il *telefono dell'agente* alla
 * piattaforma, come su WhatsApp Web. Due codici, due scopi opposti: la
 * confusione fra i due è già costata tempo in passato.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isQrServiceConfigured()) {
    return NextResponse.json(
      {
        error: "service_not_configured",
        message:
          "Il collegamento rapido non è ancora attivo su questo ambiente. Usa la configurazione avanzata oppure contatta l'assistenza.",
      },
      { status: 503 }
    );
  }

  const organizationId = session.user.organizationId;
  const config = await getOrCreateWhatsAppConfig(organizationId);

  // La sessione si crea una volta e si riusa: il QR di WhatsApp scade in
  // pochi secondi e l'agente ne chiederà altri, ma sempre per la stessa
  // sessione. Generarne una nuova a ogni clic lascerebbe sul microservizio
  // una scia di sessioni orfane, ognuna con le sue credenziali.
  const sessionId = config.qrSessionId ?? `org-${organizationId}-${randomUUID().slice(0, 8)}`;

  try {
    const { qrDataUrl } = await requestQrCode(sessionId);

    // Salvata prima che l'agente inquadri: il webhook di conferma arriva dal
    // microservizio e deve poter risalire all'organizzazione da questo id.
    if (config.qrSessionId !== sessionId) {
      await prisma.whatsAppConfig.update({
        where: { organizationId },
        data: { qrSessionId: sessionId, provider: "qr" },
      });
    }

    return NextResponse.json({ qrDataUrl, sessionId });
  } catch (error) {
    if (error instanceof QrServiceError) {
      console.error("[api/whatsapp/qr/generate] Servizio non disponibile", {
        organizationId,
        code: error.code,
      });
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === "not_configured" ? 503 : 502 }
      );
    }

    console.error("[api/whatsapp/qr/generate] Errore inatteso", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/** Scollega la sessione: chiude il socket e cancella le credenziali sul servizio. */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  const config = await getOrCreateWhatsAppConfig(organizationId);

  if (config.qrSessionId) {
    try {
      const { destroyQrSession } = await import("@/lib/whatsapp/qr-service");
      await destroyQrSession(config.qrSessionId);
    } catch (error) {
      // Non blocca: se il servizio è irraggiungibile l'agenzia deve poter
      // comunque staccare il collegamento dalla propria scheda, altrimenti
      // resterebbe bloccata su uno stato che non rispecchia la realtà.
      console.error("[api/whatsapp/qr/generate] Chiusura sessione non riuscita", error);
    }
  }

  const updated = await prisma.whatsAppConfig.update({
    where: { organizationId },
    data: { isConnected: false, qrSessionId: null, qrConnectedAt: null, phoneNumber: null },
  });

  return NextResponse.json(toPublicWhatsAppConfig(updated));
}
