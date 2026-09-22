import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { pianoCorrente } from "@/lib/feature-access";
import { bonusAccessibile } from "@/lib/bonuses";
import { soloNoteNote, soloVociNote } from "@/lib/audit/checklist";

/**
 * La checklist di conformità salvata su un immobile.
 *
 * # Il cancello è il bonus, non un piano scritto qui
 *
 * `audit-conformita` è uno strumento riservato (`lib/bonuses.ts`), e la
 * pagina lo verifica già. Ripeterlo qui non è ridondanza: la pagina è una
 * schermata, questa è un'API, e chi conosce l'indirizzo la chiama senza
 * passare dalla schermata. Un controllo che vive solo nell'interfaccia non è
 * un controllo (CLAUDE.md §5).
 *
 * # L'isolamento fra agenzie
 *
 * Ogni lettura e ogni scrittura filtrano su `organizationId`, e l'immobile
 * viene cercato **con quel filtro**: senza, l'id di un immobile di un'altra
 * agenzia restituirebbe la sua checklist a chi lo indovina.
 */

const salvataggioSchema = z.object({
  states: z.record(z.string(), z.unknown()),
  notes: z.record(z.string(), z.unknown()).optional(),
});

async function autorizza(
  propertyId: string
): Promise<{ ok: true; organizationId: string } | { ok: false; risposta: Response }> {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return { ok: false, risposta: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const organizationId = session.user.organizationId;
  const piano = await pianoCorrente(organizationId);

  if (!bonusAccessibile(piano, "audit-conformita")) {
    return {
      ok: false,
      risposta: NextResponse.json(
        {
          error: "feature_not_in_plan",
          resource: "audit-conformita",
          message: "La Checklist di conformità non è inclusa nel tuo piano.",
        },
        { status: 402 }
      ),
    };
  }

  const immobile = await prisma.property.findFirst({
    where: { id: propertyId, organizationId },
    select: { id: true },
  });

  if (!immobile) {
    return {
      ok: false,
      risposta: NextResponse.json({ error: "not_found" }, { status: 404 }),
    };
  }

  return { ok: true, organizationId };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const esito = await autorizza(id);
  if (!esito.ok) return esito.risposta;

  const audit = await prisma.propertyAudit.findFirst({
    where: { propertyId: id, organizationId: esito.organizationId },
    select: { states: true, notes: true, updatedAt: true },
  });

  if (!audit) {
    // Nessuna checklist ancora: non è un errore, è il caso normale la prima
    // volta che si apre un immobile.
    return NextResponse.json({ states: {}, notes: {}, updatedAt: null });
  }

  return NextResponse.json({
    states: soloVociNote(audit.states),
    notes: soloNoteNote(audit.notes),
    updatedAt: audit.updatedAt.toISOString(),
  });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const esito = await autorizza(id);
  if (!esito.ok) return esito.risposta;

  const body = await request.json().catch(() => null);
  const parsed = salvataggioSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", message: "Dati della checklist non validi." },
      { status: 400 }
    );
  }

  /*
   * Si salva solo ciò che corrisponde a una voce esistente.
   *
   * Il corpo arriva dal browser, quindi può contenere qualsiasi chiave: senza
   * questo filtro la colonna JSON diventerebbe un deposito per dati arbitrari
   * scritti da chiunque abbia un account.
   */
  const states = soloVociNote(parsed.data.states);
  const notes = soloNoteNote(parsed.data.notes ?? {});

  const audit = await prisma.propertyAudit.upsert({
    where: { propertyId: id },
    create: { propertyId: id, organizationId: esito.organizationId, states, notes },
    update: { states, notes },
    select: { updatedAt: true },
  });

  return NextResponse.json({ ok: true, updatedAt: audit.updatedAt.toISOString() });
}
