import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Stato dei passaggi di avvio, dedotto da ciò che l'agenzia ha realmente
 * fatto: nessun flag "onboarding completato" da mantenere sincronizzato, così
 * la checklist non può divergere dallo stato effettivo dell'account.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;

  const [config, usage, slotCount, propertyCount, matchCount] = await Promise.all([
    prisma.whatsAppConfig.findUnique({
      where: { organizationId },
      select: { isConnected: true },
    }),
    prisma.usageTracker.findUnique({
      where: { organizationId },
      select: { docCreditsUsed: true, whatsappCreditsUsed: true },
    }),
    prisma.calendarSlot.count({ where: { organizationId } }),
    prisma.property.count({ where: { organizationId } }),
    prisma.propertyLeadMatch.count({ where: { organizationId } }),
  ]);

  const steps = {
    whatsappConnected: config?.isConnected ?? false,
    calendarReady: slotCount > 0,
    // Un'alternativa, non due passaggi: visura e immobile portano entrambi
    // dati in archivio, e chiederli tutti e due allungherebbe l'avvio senza
    // aggiungere nulla a quello che l'agente deve capire.
    firstPropertyOrDocument: propertyCount > 0 || (usage?.docCreditsUsed ?? 0) > 0,
    firstMatchFound: matchCount > 0,
  };

  const completed = Object.values(steps).filter(Boolean).length;

  return NextResponse.json({
    steps,
    completed,
    total: Object.keys(steps).length,
    isComplete: completed === Object.keys(steps).length,
  });
}
