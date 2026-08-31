import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Note interne di un lead.
 *
 * # Chi le vede
 *
 * Chiunque nell'agenzia. Sono lo strumento con cui un agente passa una
 * trattativa a un collega, e limitarle all'assegnatario le renderebbe inutili
 * proprio nel momento per cui esistono: il subentro.
 *
 * # Cosa NON sono
 *
 * Non vengono mai inviate al cliente e non entrano nel contesto dell'agente
 * AI. È la ragione per cui vivono in una tabella separata invece che nella
 * cronologia della chat: quella è ciò che il cliente ha scritto e ricevuto, e
 * mescolarci un appunto interno significherebbe, prima o poi, spedirglielo.
 */

const MAX_LUNGHEZZA = 2000;

const noteSchema = z.object({
  content: z
    .string({ error: "Scrivi qualcosa" })
    .trim()
    .min(1, "La nota non può essere vuota")
    .max(MAX_LUNGHEZZA, `La nota non può superare i ${MAX_LUNGHEZZA} caratteri`),
});

/** Nome da mostrare in firma, con l'email come ultima risorsa. */
function nomeAutore(user: { firstName?: string | null; lastName?: string | null; email?: string | null }) {
  const completo = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return completo || user.email || null;
}

/**
 * Verifica che il lead sia dell'agenzia di chi chiede.
 *
 * L'id da solo permetterebbe di leggere e scrivere note sui contatti di
 * un'altra agenzia (CLAUDE.md §5): il filtro sull'organizzazione non dipende
 * mai da un parametro della richiesta.
 */
async function leadDellAgenzia(id: string, organizationId: string): Promise<boolean> {
  const lead = await prisma.lead.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  return lead !== null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!(await leadDellAgenzia(id, session.user.organizationId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const notes = await prisma.leadNote.findMany({
    where: { leadId: id, organizationId: session.user.organizationId },
    // Dalla più recente: chi apre la scheda vuole sapere com'è messa adesso,
    // non da dove è partita.
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, content: true, authorName: true, createdAt: true },
  });

  return NextResponse.json({ notes });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!(await leadDellAgenzia(id, session.user.organizationId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = noteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", message: parsed.error.issues[0]?.message ?? "Nota non valida." },
      { status: 400 }
    );
  }

  const autore = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { firstName: true, lastName: true, email: true },
  });

  const note = await prisma.leadNote.create({
    data: {
      leadId: id,
      organizationId: session.user.organizationId,
      authorId: session.user.id,
      // Il nome è congelato qui: serve a firmare la nota anche dopo che la
      // persona ha lasciato l'agenzia e la relazione è stata azzerata.
      authorName: autore ? nomeAutore(autore) : null,
      content: parsed.data.content,
    },
    select: { id: true, content: true, authorName: true, createdAt: true },
  });

  return NextResponse.json({ note }, { status: 201 });
}
