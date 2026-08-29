import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateReset, RESET_TTL_MINUTES } from "@/lib/auth/password-reset";
import { sendPasswordResetEmail } from "@/lib/email/transactional";
import { SITE_URL } from "@/lib/seo";

/**
 * Richiesta di reimpostazione password.
 *
 * # La risposta è sempre la stessa
 *
 * Email nota o sconosciuta, account con password o registrato via Google:
 * questa rotta risponde 200 con lo stesso messaggio. Distinguere i casi
 * trasformerebbe l'endpoint in un modo per **verificare quali indirizzi hanno
 * un account** — un elenco che vale molto per chi prepara una campagna di
 * phishing mirata contro agenzie immobiliari.
 *
 * Lo stesso vale per i tempi: il lavoro fatto è quasi identico nei due rami,
 * e l'invio dell'email non è atteso in modo che ne cambi la durata in modo
 * osservabile.
 */

const schema = z.object({
  email: z.string().trim().email("Indirizzo email non valido").max(200),
});

/** Identica in ogni caso: è il punto della rotta. */
const RISPOSTA = {
  ok: true,
  message:
    "Se l'indirizzo è presente nei nostri sistemi, riceverai un link per reimpostare la password.",
};

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    // L'unico 400: un indirizzo malformato non è un'informazione su chi è
    // registrato, è un errore di compilazione del form.
    return NextResponse.json(
      { error: "invalid_email", message: parsed.error.issues[0]?.message ?? "Dati non validi." },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase();

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true, passwordHash: true, acceptedAt: true },
    });

    // Tre motivi per non spedire, tutti indistinguibili dall'esterno:
    // l'utente non esiste; non ha ancora accettato l'invito (l'accesso lo
    // crea quel flusso, non questo); non ha una password perché è entrato con
    // Google, e reimpostarne una lo confonderebbe senza aiutarlo.
    if (user && user.acceptedAt && user.passwordHash) {
      const reset = generateReset();

      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: reset.tokenHash, expiresAt: reset.expiresAt },
      });

      await sendPasswordResetEmail({
        to: user.email,
        firstName: user.firstName,
        resetUrl: `${SITE_URL}/reset-password?token=${reset.token}`,
        expiresInMinutes: RESET_TTL_MINUTES,
      });
    }
  } catch (error) {
    // Nemmeno un guasto interno cambia la risposta: un 500 solo per gli
    // indirizzi esistenti sarebbe di nuovo un oracolo.
    console.error("[api/auth/forgot-password] Richiesta non completata", {
      reason: error instanceof Error ? error.message : "unknown",
    });
  }

  return NextResponse.json(RISPOSTA);
}
