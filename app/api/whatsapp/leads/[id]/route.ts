import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Elimina definitivamente un lead e la sua conversazione.
 *
 * Nato per ripulire le schede di prova, ma è anche la strada con cui
 * un'agenzia dà seguito a una richiesta di cancellazione dell'interessato
 * (art. 17 GDPR): per questo cancella davvero invece di marcare la riga.
 *
 * Cosa sparisce con il lead, per cascata dichiarata nello schema: la
 * cronologia WhatsApp (`WhatsAppChat`), gli abbinamenti di portafoglio e i
 * match con gli immobili. Cosa **resta**: i documenti del fascicolo, che
 * passano a `leadId: null`. Non è una svista — sono documenti dell'agenzia
 * soggetti a conservazione decennale (art. 31 D.Lgs. 231/2007), e cancellarli
 * insieme a una scheda di prova le farebbe perdere atti che è tenuta a
 * conservare.
 */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // `?confirm=true`, come per i documenti: la cancellazione è irreversibile e
  // porta via l'intera conversazione. La finestra di conferma nella UI resta
  // la difesa vera; questo impedisce che una chiamata partita per sbaglio —
  // un link visitato, uno script di prova — cancelli una scheda in silenzio.
  if (new URL(request.url).searchParams.get("confirm") !== "true") {
    return NextResponse.json({ error: "confirmation_required" }, { status: 400 });
  }

  const lead = await prisma.lead.findFirst({
    // organizationId nel filtro: l'id da solo permetterebbe di cancellare il
    // lead di un'altra agenzia (CLAUDE.md §5).
    where: { id, organizationId: session.user.organizationId },
    select: { id: true, calendarSlotId: true },
  });

  if (!lead) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.$transaction([
    // Lo slot va liberato **prima**: la cascata cancella il lead ma non tocca
    // `CalendarSlot.isBooked`, e resterebbe in agenda un appuntamento fantasma
    // per un contatto che non esiste più — tempo dell'agente occupato che
    // nessuno recupera fino al giorno della visita.
    ...(lead.calendarSlotId
      ? [prisma.calendarSlot.update({ where: { id: lead.calendarSlotId }, data: { isBooked: false } })]
      : []),
    prisma.lead.delete({ where: { id: lead.id } }),
  ]);

  console.info("[leads] Lead eliminato", {
    organizationId: session.user.organizationId,
    leadId: lead.id,
    slotLiberato: Boolean(lead.calendarSlotId),
  });

  return NextResponse.json({ deleted: true });
}

const patchSchema = z.object({ aiEnabled: z.boolean() });

/**
 * Accende o spegne l'assistente su una conversazione (handover umano).
 *
 * E' la stessa cosa che fa `!pausa` dalla chat WhatsApp, dal lato della
 * scrivania: chi lavora in ufficio non deve aprire WhatsApp sul telefono per
 * prendere in carico un cliente.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // updateMany con l'organizationId nel filtro: l'id da solo permetterebbe di
  // mettere in pausa l'assistente di un'altra agenzia (CLAUDE.md §5).
  const result = await prisma.lead.updateMany({
    where: { id, organizationId: session.user.organizationId },
    data: {
      aiEnabled: parsed.data.aiEnabled,
      // Stessa distinzione del comando in chat: spegnere da qui e' una
      // decisione di una persona, e vale finche' non la revoca lei.
      aiPausedBy: parsed.data.aiEnabled ? null : "AGENTE",
    },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ aiEnabled: parsed.data.aiEnabled });
}
