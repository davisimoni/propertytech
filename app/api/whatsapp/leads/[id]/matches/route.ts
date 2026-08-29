import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Immobili del portafoglio compatibili con questo lead.
 *
 * Rotta a parte e non campo dell'elenco, per la stessa ragione per cui la
 * cronologia chat non sta nell'elenco: `/api/whatsapp/leads` si ricarica da
 * solo ogni quindici secondi e restituisce fino a cento contatti. Includere
 * qui una join sugli abbinamenti significherebbe pagarla cento volte al
 * minuto per un dato che si guarda solo aprendo una scheda.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  const { id } = await context.params;

  // Appartenenza verificata sul lead: senza, un id indovinato mostrerebbe gli
  // immobili abbinati a un contatto di un'altra agenzia (CLAUDE.md §5).
  const lead = await prisma.lead.findFirst({
    where: { id, organizationId },
    select: { id: true, propertyId: true },
  });

  if (!lead) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const matches = await prisma.propertyLeadMatch.findMany({
    where: { leadId: lead.id, organizationId },
    orderBy: { score: "desc" },
    take: 10,
    include: {
      property: {
        select: {
          id: true,
          reference: true,
          title: true,
          priceEur: true,
          status: true,
          comune: true,
          zona: true,
          // Solo la copertina: le altre foto non servono a una riga di elenco,
          // e l'array intero su dieci abbinamenti sarebbe carico inutile.
          images: true,
        },
      },
    },
  });

  return NextResponse.json({
    // L'immobile su cui il contatto ha scritto, distinto dagli abbinamenti
    // calcolati: sono due cose diverse e l'agente deve poterle distinguere.
    propertyId: lead.propertyId,
    matches: matches.map((match) => ({
      id: match.property.id,
      reference: match.property.reference,
      title: match.property.title,
      priceEur: match.property.priceEur,
      status: match.property.status,
      comune: match.property.comune,
      zona: match.property.zona,
      images: match.property.images.slice(0, 1),
      score: match.score,
      reasons: match.reasons,
    })),
  });
}
