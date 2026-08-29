import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildInviteUrl, generateInvite } from "@/lib/team/invitations";
import { sendInviteEmail } from "@/lib/team/invite-email";
import { SITE_URL } from "@/lib/seo";

/**
 * Rinvia l'invito a un collaboratore che non l'ha ancora accettato.
 *
 * # Perché rigenera il token invece di rispedire quello vecchio
 *
 * Nel database c'è solo l'impronta dell'invito: il valore in chiaro è esistito
 * per il tempo della prima email e non è ricostruibile. Rigenerarlo non è una
 * scelta di sicurezza opzionale, è l'unico modo di avere di nuovo un link
 * valido — ed è anche la cosa giusta, perché fa ripartire i sette giorni per
 * chi non ha fatto in tempo.
 *
 * Il link precedente smette di funzionare: è il comportamento atteso quando si
 * chiede "rinvia", e protegge il caso in cui la prima email sia finita
 * all'indirizzo sbagliato.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "forbidden", message: "Solo il titolare può gestire gli inviti." },
      { status: 403 }
    );
  }

  const organizationId = session.user.organizationId;
  const { id } = await context.params;

  const [target, organization, inviter] = await Promise.all([
    // organizationId nel filtro: un id indovinato non deve permettere di
    // rigenerare l'invito di un'altra agenzia (CLAUDE.md §5).
    prisma.user.findFirst({
      where: { id, organizationId },
      select: { id: true, email: true, acceptedAt: true },
    }),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { agencyName: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.userId },
      select: { firstName: true },
    }),
  ]);

  if (!target) {
    return NextResponse.json({ error: "member_not_found" }, { status: 404 });
  }

  // Un collaboratore che ha già accettato non ha un invito da rinviare: se ha
  // perso la password, il percorso è il recupero, non un nuovo invito che
  // rimetterebbe il suo account in stato "in attesa".
  if (target.acceptedAt !== null) {
    return NextResponse.json(
      { error: "already_accepted", message: "Questo collaboratore ha già attivato l'accesso." },
      { status: 409 }
    );
  }

  const invite = generateInvite();

  await prisma.user.update({
    where: { id: target.id },
    data: { inviteTokenHash: invite.tokenHash, inviteExpiresAt: invite.expiresAt },
  });

  const inviteUrl = buildInviteUrl(SITE_URL, invite.token);

  const outcome = await sendInviteEmail({
    to: target.email,
    agencyName: organization?.agencyName ?? "la tua agenzia",
    inviteUrl,
    inviterName: inviter?.firstName,
  });

  console.info("[api/team] Invito rinviato", { organizationId, memberId: target.id, outcome });

  return NextResponse.json({
    email: target.email,
    emailOutcome: outcome,
    // Stesso ripiego della creazione: il link torna solo se l'email non è
    // partita, altrimenti l'invito sarebbe irrecuperabile.
    ...(outcome === "sent" ? {} : { inviteUrl }),
    expiresAt: invite.expiresAt.toISOString(),
  });
}
