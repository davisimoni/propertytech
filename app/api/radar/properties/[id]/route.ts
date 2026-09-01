import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { runRadarMatching } from "@/lib/radar/matching";
import { dropPercent } from "@/lib/radar/roi";

/**
 * Aggiornamento di un lotto: parametri economici e prezzo.
 *
 * # Il ribasso non si dichiara, si deduce
 *
 * L'agente aggiorna il prezzo; il resto lo fa la rotta. `previousPriceEur`
 * prende il valore precedente, la percentuale si calcola, e gli abbinamenti si
 * ricalcolano subito — perché è esattamente il momento in cui un lead che
 * prima era fuori budget ci rientra, ed è la notizia che vale il modulo.
 *
 * Chiedere all'agente di premere un secondo tasto "ricalcola" significherebbe
 * che chi non lo preme non scopre mai quei lead.
 */

export const maxDuration = 60;

const patchSchema = z.object({
  priceEur: z.coerce.number().int().positive().optional(),
  transferCostsEur: z.coerce.number().int().min(0).optional().nullable(),
  renovationCostEur: z.coerce.number().int().min(0).optional().nullable(),
  marketValueEur: z.coerce.number().int().min(0).optional().nullable(),
  monthlyRentEur: z.coerce.number().int().min(0).optional().nullable(),
  /** Segna come visto l'avviso di ribasso. */
  dismissPriceDrop: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const organizationId = session.user.organizationId;
  const { id } = await context.params;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", message: parsed.error.issues[0]?.message ?? "Dati non validi." },
      { status: 400 }
    );
  }

  const attuale = await prisma.radarProperty.findFirst({
    where: { id, organizationId },
    select: { id: true, priceEur: true, comune: true },
  });
  if (!attuale) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const d = parsed.data;
  const nuovoPrezzo = d.priceEur ?? attuale.priceEur;
  const ribasso = d.priceEur !== undefined ? dropPercent(attuale.priceEur, nuovoPrezzo) : null;

  // Quanti lead erano abbinati prima: la differenza dopo il ricalcolo è ciò
  // che rende l'avviso utile ("3 nuovi lead rientrano nel budget") invece che
  // una constatazione ("il prezzo è sceso").
  const abbinatiPrima =
    ribasso !== null
      ? await prisma.auctionLeadMatch.count({ where: { radarPropertyId: id, organizationId } })
      : 0;

  const item = await prisma.radarProperty.update({
    where: { id },
    data: {
      ...(d.priceEur !== undefined ? { priceEur: d.priceEur } : {}),
      ...(d.transferCostsEur !== undefined ? { transferCostsEur: d.transferCostsEur } : {}),
      ...(d.renovationCostEur !== undefined ? { renovationCostEur: d.renovationCostEur } : {}),
      ...(d.marketValueEur !== undefined ? { marketValueEur: d.marketValueEur } : {}),
      ...(d.monthlyRentEur !== undefined ? { monthlyRentEur: d.monthlyRentEur } : {}),
      ...(ribasso !== null
        ? {
            // Il prezzo di prima diventa il riferimento del ribasso.
            previousPriceEur: attuale.priceEur,
            priceDropPct: ribasso,
            priceDropAt: new Date(),
            // Azzerato: un ribasso nuovo è un avviso nuovo, anche se quello
            // precedente era già stato letto.
            priceDropSeenAt: null,
          }
        : {}),
      ...(d.dismissPriceDrop ? { priceDropSeenAt: new Date() } : {}),
    },
  });

  let nuoviAbbinamenti = 0;

  if (ribasso !== null) {
    const esito = await runRadarMatching(organizationId, id);
    nuoviAbbinamenti = Math.max(0, esito.matched - abbinatiPrima);

    await prisma.radarProperty.update({
      where: { id },
      data: { priceDropNewMatches: nuoviAbbinamenti },
    });

    console.info("[RADAR-PRICE-DROP]", {
      organizationId,
      radarPropertyId: id,
      ribassoPct: ribasso,
      nuoviAbbinamenti,
    });
  }

  return NextResponse.json({ item, priceDropPct: ribasso, nuoviAbbinamenti });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // `?confirm=true` come per le altre cancellazioni: un clic sbagliato non
  // porta via un lotto con la sua perizia e i suoi abbinamenti.
  if (new URL(request.url).searchParams.get("confirm") !== "true") {
    return NextResponse.json({ error: "confirmation_required" }, { status: 400 });
  }

  const { id } = await context.params;
  const { count } = await prisma.radarProperty.deleteMany({
    where: { id, organizationId: session.user.organizationId },
  });

  if (count === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
