import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { hashInviteToken, inviteState, INVITE_STATE_MESSAGES } from "@/lib/team/invitations";

/**
 * Accettazione di un invito: la persona imposta la propria password ed entra
 * nell'agenzia che l'ha invitata.
 *
 * Rotta pubblica di proposito — chi accetta non ha ancora un account — ma
 * l'autorizzazione è il token, che vale una sola volta e per una sola agenzia.
 */
const acceptSchema = z.object({
  token: z.string().min(20).max(200),
  firstName: z.string().trim().min(2, "Inserisci il tuo nome.").max(60),
  lastName: z.string().trim().min(2, "Inserisci il tuo cognome.").max(60),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri.").max(72),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = acceptSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", message: parsed.error.issues[0]?.message ?? "Dati non validi." },
      { status: 400 }
    );
  }

  const { token, firstName, lastName, password } = parsed.data;

  // Si cerca per impronta: il token in chiaro non è mai stato salvato.
  const invited = await prisma.user.findUnique({
    where: { inviteTokenHash: hashInviteToken(token) },
    select: {
      id: true,
      email: true,
      inviteExpiresAt: true,
      acceptedAt: true,
      organizationId: true,
      organization: { select: { agencyName: true } },
    },
  });

  const state = inviteState(invited);

  if (!invited || state !== "valid") {
    // `invited` nullo implica già "not_found", ma il compilatore non può
    // dedurlo dalla firma di `inviteState`: lo si dichiara esplicitamente.
    const reason = state === "valid" ? "not_found" : state;

    return NextResponse.json(
      { error: reason, message: INVITE_STATE_MESSAGES[reason] },
      { status: reason === "not_found" ? 404 : 409 }
    );
  }

  await prisma.user.update({
    where: { id: invited.id },
    data: {
      firstName,
      lastName,
      passwordHash: await hashPassword(password),
      acceptedAt: new Date(),
      // Il token viene bruciato: un link intercettato dopo l'accettazione non
      // vale più nulla.
      inviteTokenHash: null,
      inviteExpiresAt: null,
    },
  });

  // Avviso al titolare, non bloccante: il collaboratore ha gia' l'accesso, e
  // un fornitore di posta lento non deve tenerlo fermo su una schermata di
  // caricamento.
  try {
    const { resolveOwner } = await import("@/lib/email/recipients");
    const { sendInviteAcceptedEmail } = await import("@/lib/email/transactional");

    const owner = await resolveOwner(invited.organizationId);

    // Non si avvisa il titolare di se stesso: sul primo account dell'agenzia
    // invitante e invitato coincidono.
    if (owner && owner.email !== invited.email) {
      const nome = [firstName, lastName].filter(Boolean).join(" ").trim();
      await sendInviteAcceptedEmail({
        to: owner.email,
        firstName: owner.firstName,
        memberName: nome || invited.email,
        memberEmail: invited.email,
      });
    }
  } catch (error) {
    console.error("[api/team/accept] Avviso al titolare non inviato", {
      reason: error instanceof Error ? error.message : "unknown",
    });
  }

  return NextResponse.json({
    accepted: true,
    email: invited.email,
    agencyName: invited.organization.agencyName,
  });
}
