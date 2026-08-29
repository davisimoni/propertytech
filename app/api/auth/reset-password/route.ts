import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import {
  hashResetToken,
  MIN_PASSWORD_LENGTH,
  RESET_STATE_MESSAGES,
  resetState,
} from "@/lib/auth/password-reset";
import { sendPasswordUpdatedEmail } from "@/lib/email/transactional";

/**
 * Reimpostazione della password con un token valido.
 *
 * A differenza di `/forgot-password`, qui gli errori si spiegano: chi arriva
 * con un token in mano non sta sondando quali email esistono, sta cercando di
 * rientrare nel proprio account, e "link scaduto" gli dice cosa fare mentre un
 * generico "non valido" lo lascia a copiare e ricopiare lo stesso link.
 */

const schema = z.object({
  token: z.string().min(16, "Token non valido").max(200),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri`)
    .max(200),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: parsed.error.issues[0]?.message ?? "Dati non validi." },
      { status: 400 }
    );
  }

  const record = await prisma.passwordResetToken.findUnique({
    // Si cerca per IMPRONTA: il token in chiaro non esiste nel database, e
    // questa query è anche il motivo per cui `tokenHash` è unico e indicizzato.
    where: { tokenHash: hashResetToken(parsed.data.token) },
    select: {
      id: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { id: true, email: true, firstName: true } },
    },
  });

  const stato = resetState(record);

  if (stato !== "valid" || !record) {
    return NextResponse.json(
      { error: stato, message: RESET_STATE_MESSAGES[stato as keyof typeof RESET_STATE_MESSAGES] },
      { status: 400 }
    );
  }

  const passwordHash = await hashPassword(parsed.data.password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.user.id },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    // Gli ALTRI token in sospeso dello stesso utente decadono.
    //
    // Chi ha chiesto il reset tre volte perché la prima email non arrivava si
    // ritroverebbe altrimenti due link ancora validi in casella, e ognuno di
    // quei messaggi resta una chiave dell'account finché non scade da solo.
    prisma.passwordResetToken.updateMany({
      where: { userId: record.user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  // Conferma di sicurezza, non bloccante: la password è già cambiata, e chi ha
  // appena reimpostato deve poter accedere anche se la posta non parte.
  try {
    await sendPasswordUpdatedEmail({
      to: record.user.email,
      firstName: record.user.firstName,
      when: new Date(),
    });
  } catch (error) {
    console.error("[api/auth/reset-password] Conferma non inviata", {
      reason: error instanceof Error ? error.message : "unknown",
    });
  }

  console.info("[PASSWORD-RESET] Password reimpostata", { userId: record.user.id });

  return NextResponse.json({ ok: true });
}
