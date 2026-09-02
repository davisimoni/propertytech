import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getConnectionStatus } from "@/lib/social/meta";

/**
 * Stato del collegamento social, e scollegamento.
 *
 * Lo stato lo legge chiunque nell'agenzia: sapere se i social sono collegati
 * serve a chi scrive i post, non solo a chi li ha collegati. Scollegare invece
 * e' del titolare, come ogni altra integrazione che parla a nome dell'agenzia.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await getConnectionStatus(session.user.organizationId));
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "forbidden", message: "Solo il titolare puo' scollegare i social dell'agenzia." },
      { status: 403 }
    );
  }

  // `deleteMany` e non `delete`: scollegare qualcosa che non c'e' non e' un
  // errore, e un 500 su un'operazione gia' compiuta confonde e basta.
  await prisma.socialConnection.deleteMany({
    where: { organizationId: session.user.organizationId },
  });

  console.info("[SOCIAL-DISCONNECTED]", { organizationId: session.user.organizationId });

  return NextResponse.json({ connected: false });
}
