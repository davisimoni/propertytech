import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { registerSchema } from "@/lib/validation/auth";
import { DPA_VERSION } from "@/lib/compliance";
import { createOrganizationWithReferralCode } from "@/lib/referrals/code";
import { linkReferral } from "@/lib/referrals/link";
import { REFERRAL_COOKIE_NAME } from "@/lib/referrals/constants";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { firstName, lastName, agencyName, email, password, referralCode } = parsed.data;

  const existing = await prisma.organization.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "email_already_registered" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  // Il nome agenzia è facoltativo. Se manca si usa un segnaposto derivato
  // dall'email e si lascia `agencyNameConfirmed` a false: la dashboard mostra
  // allora il banner che chiede il nome vero, lo stesso percorso già usato
  // dagli account creati via Google.
  const declaredAgencyName = agencyName?.trim();
  const resolvedAgencyName = declaredAgencyName || email.split("@")[0] || "La mia agenzia";

  const organization = await createOrganizationWithReferralCode((generatedReferralCode) => ({
    firstName,
    lastName,
    agencyName: resolvedAgencyName,
    agencyNameConfirmed: Boolean(declaredAgencyName),
    email,
    passwordHash,
    referralCode: generatedReferralCode,
    // Lo schema impone `acceptedTerms: true`, quindi arrivati qui
    // l'accettazione è avvenuta: si registrano istante e versione.
    dpaAcceptedAt: new Date(),
    dpaAcceptedVersion: DPA_VERSION,
    subscription: { create: { status: "trial" } },
    usageTracker: { create: {} },
    // Chi registra l'agenzia ne è il titolare: è l'unico che potrà invitare
    // collaboratori e toccare abbonamento e integrazioni.
    users: {
      create: {
        email,
        passwordHash,
        firstName,
        lastName,
        role: "OWNER",
        acceptedAt: new Date(),
      },
    },
  }));

  // Il codice esplicito nel corpo (form) ha la precedenza; il cookie copre il
  // caso in cui l'agenzia sia arrivata su `/register?ref=` e sia poi passata
  // da un altro percorso prima di inviare il form.
  const cookieStore = await cookies();
  const referralCodeFromCookie = cookieStore.get(REFERRAL_COOKIE_NAME)?.value;
  await linkReferral(organization.id, referralCode || referralCodeFromCookie);

  // Benvenuto, non bloccante: l'account e' gia' creato e valido: un fornitore
  // di posta che non risponde non deve trasformarsi in una registrazione
  // fallita davanti a chi ha appena compilato il form.
  try {
    const { sendWelcomeEmail } = await import("@/lib/email/transactional");
    await sendWelcomeEmail({ to: email, firstName, agencyName: organization.agencyName });
  } catch (error) {
    console.error("[api/register] Email di benvenuto non inviata", {
      organizationId: organization.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
