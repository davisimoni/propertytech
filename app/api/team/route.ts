import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildInviteUrl, generateInvite } from "@/lib/team/invitations";
import { SITE_URL } from "@/lib/seo";
import { PLANS, type Plan, type PlanId } from "@/lib/plans";

/**
 * Collaboratori dell'agenzia.
 *
 * Solo il titolare può invitare o rimuovere: un collaboratore che potesse
 * aggiungerne altri aggirerebbe di fatto il limite di postazioni del piano, e
 * potrebbe dare accesso ai dati dei clienti a chiunque.
 */

/** Primo piano che offre più postazioni di quelle attuali, per suggerire dove salire. */
function nextPlanWithMoreSeats(currentSeats: number): Plan | null {
  return (
    Object.values(PLANS).find(
      (candidate) => candidate.seatsLimit === null || candidate.seatsLimit > currentSeats
    ) ?? null
  );
}

/** Messaggio mostrato al titolare: dice cosa manca e dove trovarlo. */
function seatsLimitMessage(plan: Plan): string {
  const seats = plan.seatsLimit ?? 0;
  const suggested = nextPlanWithMoreSeats(seats);
  const postazioni = seats === 1 ? "una sola postazione" : `${seats} postazioni`;

  if (!suggested) {
    return `Il piano ${plan.name} include ${postazioni}. Scrivici per aumentare le postazioni dell'agenzia.`;
  }

  const disponibili =
    suggested.seatsLimit === null
      ? "postazioni illimitate"
      : `${suggested.seatsLimit} postazioni`;

  return `Il piano ${plan.name} include ${postazioni}. Passa a ${suggested.name} per avere ${disponibili} e aggiungere altri collaboratori.`;
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Inserisci un'email valida").max(200),
  firstName: z.string().trim().max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
});

/** Elenco dei membri dell'agenzia. Visibile a tutti: sapere chi sono i colleghi
 *  serve per assegnare i lead, e non espone nulla di sensibile. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const members = await prisma.user.findMany({
    // organizationId nel filtro: nessuna agenzia vede i membri di un'altra.
    where: { organizationId: session.user.organizationId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      acceptedAt: true,
      inviteExpiresAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    members: members.map((member) => ({
      id: member.id,
      email: member.email,
      firstName: member.firstName,
      lastName: member.lastName,
      role: member.role,
      // Chi non ha ancora impostato la password risulta "invitato".
      isPending: member.acceptedAt === null,
      inviteExpiresAt: member.inviteExpiresAt?.toISOString() ?? null,
      createdAt: member.createdAt.toISOString(),
    })),
    currentUserId: session.user.userId,
  });
}

/** Invita un collaboratore e restituisce il link da consegnargli. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "forbidden", message: "Solo il titolare può invitare collaboratori." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = inviteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", message: parsed.error.issues[0]?.message ?? "Dati non validi." },
      { status: 400 }
    );
  }

  const { email, firstName, lastName } = parsed.data;
  const organizationId = session.user.organizationId;

  // Le postazioni si contano PRIMA di creare l'invito, non dopo: un invito già
  // generato che poi viene rifiutato lascerebbe una riga inutile in archivio e
  // un link che non porta da nessuna parte.
  //
  // Nel conteggio rientrano anche gli inviti non ancora accettati: altrimenti
  // basterebbe generarne dieci in fila per superare il limite del piano.
  const [organization, occupiedSeats] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { subscription: { select: { status: true } } },
    }),
    prisma.user.count({ where: { organizationId } }),
  ]);

  const plan = PLANS[(organization?.subscription?.status ?? "trial") as PlanId];

  if (plan.seatsLimit !== null && occupiedSeats >= plan.seatsLimit) {
    return NextResponse.json(
      {
        error: "seats_limit_reached",
        resource: "seats",
        requiredPlan: nextPlanWithMoreSeats(plan.seatsLimit)?.name ?? PLANS.enterprise.name,
        used: occupiedSeats,
        limit: plan.seatsLimit,
        message: seatsLimitMessage(plan),
      },
      // 402 come gli altri gate di piano, così la UI li intercetta allo stesso modo.
      { status: 402 }
    );
  }

  const invite = generateInvite();

  try {
    const member = await prisma.user.create({
      data: {
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        role: "AGENT",
        organizationId,
        inviteTokenHash: invite.tokenHash,
        inviteExpiresAt: invite.expiresAt,
      },
      select: { id: true, email: true },
    });

    return NextResponse.json(
      {
        member,
        // Il token in chiaro esiste solo in questa risposta: nel database c'è
        // la sola impronta, e non è più ricostruibile.
        inviteUrl: buildInviteUrl(SITE_URL, invite.token),
        expiresAt: invite.expiresAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        {
          error: "email_already_used",
          message: "Questo indirizzo è già associato a un account PropertyTech.",
        },
        { status: 409 }
      );
    }

    console.error("[api/team] Invito non riuscito", error);
    return NextResponse.json({ error: "invite_failed" }, { status: 502 });
  }
}
