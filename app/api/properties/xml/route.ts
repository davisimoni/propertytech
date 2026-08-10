import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildPortalFeed, portalFeedFileName } from "@/lib/listings/portal-xml";

/**
 * Feed XML degli immobili in portafoglio, pronto per i portali.
 *
 * Con `?reference=` esporta il solo immobile indicato — è il caso del pulsante
 * "Scarica XML Portali" subito dopo la generazione dell'annuncio. Senza
 * parametro esporta l'intero portafoglio, che è come si alimenta un feed
 * ricorrente.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  const reference = new URL(request.url).searchParams.get("reference");

  const [organization, properties] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { agencyName: true, legalName: true },
    }),
    prisma.property.findMany({
      // organizationId sempre nel filtro: il feed di un'agenzia non può
      // contenere immobili di un'altra (CLAUDE.md §5).
      where: { organizationId, ...(reference ? { reference } : {}) },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
  ]);

  if (properties.length === 0) {
    return NextResponse.json({ error: "no_properties" }, { status: 404 });
  }

  const xml = buildPortalFeed(properties, {
    agencyName: organization?.legalName || organization?.agencyName || "",
  });

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${portalFeedFileName()}"`,
      "Cache-Control": "no-store",
    },
  });
}
