import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DPA_VERSION } from "@/lib/compliance";

/**
 * Registra l'accettazione dell'accordo sul trattamento dei dati.
 *
 * Serve agli account creati via Google, che non passano dal form di
 * registrazione e quindi non incontrano mai la casella di accettazione.
 * Il provisioning OAuth lascia deliberatamente i campi vuoti: precompilarli
 * significherebbe registrare un consenso mai prestato.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const updated = await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: { dpaAcceptedAt: new Date(), dpaAcceptedVersion: DPA_VERSION },
    select: { dpaAcceptedAt: true, dpaAcceptedVersion: true },
  });

  return NextResponse.json({
    acceptedAt: updated.dpaAcceptedAt?.toISOString() ?? null,
    version: updated.dpaAcceptedVersion,
  });
}
