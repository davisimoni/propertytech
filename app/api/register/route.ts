import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { registerSchema } from "@/lib/validation/auth";
import { DPA_VERSION } from "@/lib/compliance";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { firstName, lastName, agencyName, email, password } = parsed.data;

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

  await prisma.organization.create({
    data: {
      firstName,
      lastName,
      agencyName: resolvedAgencyName,
      agencyNameConfirmed: Boolean(declaredAgencyName),
      email,
      passwordHash,
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
    },
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
