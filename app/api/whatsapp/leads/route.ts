import { NextResponse } from "next/server";
import type { LeadView } from "@/lib/whatsapp/view-types";
import type { Prisma, QualificationStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseChatMessages } from "@/lib/whatsapp/types";

const VALID_STATUSES: QualificationStatus[] = [
  "PENDING",
  "IN_PROGRESS",
  "QUALIFIED",
  "UNQUALIFIED",
  "OPT_OUT",
];

function isValidStatus(value: string): value is QualificationStatus {
  return (VALID_STATUSES as string[]).includes(value);
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const statusParam = searchParams.get("status");

  // Il filtro su organizationId è sempre presente: l'isolamento multi-tenant
  // non dipende mai dai parametri di query (CLAUDE.md §5).
  const where: Prisma.LeadWhereInput = {
    organizationId: session.user.organizationId,
  };
  if (statusParam && isValidStatus(statusParam)) {
    where.qualificationStatus = statusParam;
  }

  // "Prima i multi-proprietari": i lead con più immobili in cima, i non ancora
  // rilevati in fondo. A parità di portafoglio resta l'ordine cronologico, così
  // fra due Lead Oro si chiama prima quello che ha scritto per ultimo.
  const orderBy: Prisma.LeadOrderByWithRelationInput[] =
    searchParams.get("sort") === "portfolio"
      ? [
          { ownedPropertiesCount: { sort: "desc", nulls: "last" } },
          { updatedAt: "desc" },
        ]
      : [{ updatedAt: "desc" }];

  const leads = await prisma.lead.findMany({
    where,
    orderBy,
    take: 100,
    include: {
      chat: true,
      // Solo i match ancora da validare: quelli confermati sono già dentro il
      // conteggio, quelli ignorati sono decisioni chiuse.
      portfolioMatches: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
      },
      assignedTo: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  // Annotata `LeadView[]` di proposito: senza il tipo, dimenticare un campo qui
  // non produce alcun errore di compilazione e il browser riceve `undefined` —
  // che è esattamente com'era sparito `createdAt`.
  const view: LeadView[] = leads.map((lead) => ({
    id: lead.id,
    clientName: lead.clientName,
    clientPhone: lead.clientPhone,
    portalSource: lead.portalSource,
    propertyRef: lead.propertyRef,
    qualificationStatus: lead.qualificationStatus,
    budget: lead.budget,
    mortgageApproved: lead.mortgageApproved,
    mustSellFirst: lead.mustSellFirst,
    timeframe: lead.timeframe,
    appointmentSlot: lead.appointmentSlot?.toISOString() ?? null,
    ownedPropertiesCount: lead.ownedPropertiesCount,
    sellerCategory: lead.sellerCategory,
    assignedToId: lead.assignedToId,
    // Nome completo se disponibile, altrimenti l'email: una scheda che dice
    // solo "assegnato" senza dire a chi non serve a niente.
    assignedToName: lead.assignedTo
      ? [lead.assignedTo.firstName, lead.assignedTo.lastName]
          .filter(Boolean)
          .join(" ") || lead.assignedTo.email
      : null,
    dealStage: lead.dealStage,
    preferredZone: lead.preferredZone,
    preferredType: lead.preferredType,
    budgetMin: lead.budgetMin,
    budgetMax: lead.budgetMax,
    minSquareMeters: lead.minSquareMeters,
    pendingMatches: lead.portfolioMatches.map((match) => ({
      id: match.id,
      ownerName: match.ownerName,
      comune: match.comune,
      foglio: match.foglio,
      particella: match.particella,
      subalterno: match.subalterno,
      categoriaCatastale: match.categoriaCatastale,
      quotaProprieta: match.quotaProprieta,
      createdAt: match.createdAt.toISOString(),
    })),
    appointmentConfirmed: lead.appointmentConfirmed,
    reminderSentAt: lead.reminderSentAt?.toISOString() ?? null,
    crmDeliveredAt: lead.crmDeliveredAt?.toISOString() ?? null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    messages: parseChatMessages(lead.chat?.messages),
  }));

  return NextResponse.json({ leads: view });
}
