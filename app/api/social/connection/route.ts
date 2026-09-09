import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getConnectionStatus, setAutoPublish } from "@/lib/social/meta";

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

const toggleSchema = z.object({
  channel: z.enum(["facebook", "instagram"]),
  enabled: z.boolean(),
});

/**
 * Attiva o disattiva la pubblicazione su un canale.
 *
 * Del titolare, come lo scollegamento: il canale parla a nome dell'agenzia,
 * non del singolo collaboratore che preme il pulsante in /social.
 */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "forbidden", message: "Solo il titolare puo' gestire i social dell'agenzia." },
      { status: 403 }
    );
  }

  const parsed = toggleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const stato = await setAutoPublish(
    session.user.organizationId,
    parsed.data.channel,
    parsed.data.enabled
  );

  if (!stato) {
    return NextResponse.json(
      { error: "not_connected", message: "Nessun collegamento social attivo." },
      { status: 404 }
    );
  }

  return NextResponse.json(stato);
}
