import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { runRadarMatching } from "@/lib/radar/matching";
import { dropPercent } from "@/lib/radar/roi";
import { geocodeZona } from "@/lib/radar/geocode";
import type { PropertyType } from "@prisma/client";

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

const PROPERTY_TYPES: PropertyType[] = [
  "APPARTAMENTO", "ATTICO", "VILLA", "VILLETTA", "LOFT", "RUSTICO",
  "TERRENO", "NEGOZIO", "UFFICIO", "BOX", "ALTRO",
];

const patchSchema = z.object({
  // --- Dati del lotto ---
  comune: z.string().trim().min(2).max(120).optional(),
  zona: z.string().trim().max(120).optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
  type: z.enum(PROPERTY_TYPES as [PropertyType, ...PropertyType[]]).optional(),
  squareMeters: z.coerce.number().int().positive().optional(),
  basePriceEur: z.coerce.number().int().positive().optional().nullable(),
  previousPriceEur: z.coerce.number().int().positive().optional().nullable(),
  auctionDate: z.string().datetime().optional().nullable(),
  lotto: z.string().trim().max(60).optional().nullable(),
  sourceUrl: z.string().trim().url().max(500).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),

  /**
   * Archiviazione: un'asta aggiudicata o un ribasso concluso escono
   * dall'elenco ma restano a database. Cancellarli porterebbe via gli
   * abbinamenti gia' mostrati all'agente e la storia di cosa e' stato
   * proposto a chi — che e' proprio cio' che serve rileggere fra sei mesi.
   */
  archived: z.boolean().optional(),

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
    select: {
      id: true,
      priceEur: true,
      comune: true,
      zona: true,
      address: true,
      type: true,
      squareMeters: true,
      latitude: true,
    },
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

  /*
   * Coordinate rifatte quando cambia il luogo.
   *
   * Un lotto spostato da un comune all'altro con il vecchio pin sulla mappa e'
   * peggio di un lotto senza pin: dice una cosa falsa invece di tacere. Si
   * ricerca solo se il luogo e' davvero cambiato — o se non c'erano
   * coordinate — per non chiamare Nominatim a ogni ritocco di prezzo.
   */
  const luogoCambiato =
    (d.comune !== undefined && d.comune !== attuale.comune) ||
    (d.zona !== undefined && (d.zona || null) !== attuale.zona) ||
    (d.address !== undefined && (d.address || null) !== attuale.address);

  let coordinate: { latitude: number; longitude: number } | null = null;
  if (luogoCambiato || (d.comune !== undefined && attuale.latitude === null)) {
    const trovate = await geocodeZona(
      d.comune ?? attuale.comune,
      d.zona ?? attuale.zona,
      d.address ?? attuale.address
    );
    coordinate = trovate ? { latitude: trovate.latitude, longitude: trovate.longitude } : null;
  }

  const item = await prisma.radarProperty.update({
    where: { id },
    data: {
      ...(d.comune !== undefined ? { comune: d.comune } : {}),
      ...(d.zona !== undefined ? { zona: d.zona || null } : {}),
      ...(d.address !== undefined ? { address: d.address || null } : {}),
      ...(d.type !== undefined ? { type: d.type } : {}),
      ...(d.squareMeters !== undefined ? { squareMeters: d.squareMeters } : {}),
      ...(d.basePriceEur !== undefined ? { basePriceEur: d.basePriceEur } : {}),
      ...(d.previousPriceEur !== undefined ? { previousPriceEur: d.previousPriceEur } : {}),
      ...(d.auctionDate !== undefined
        ? { auctionDate: d.auctionDate ? new Date(d.auctionDate) : null }
        : {}),
      ...(d.lotto !== undefined ? { lotto: d.lotto || null } : {}),
      ...(d.sourceUrl !== undefined ? { sourceUrl: d.sourceUrl || null } : {}),
      ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
      ...(d.archived !== undefined ? { archivedAt: d.archived ? new Date() : null } : {}),
      // Le coordinate si azzerano se la nuova ricerca non trova nulla: meglio
      // nessun pin che un pin nel posto sbagliato.
      ...(luogoCambiato ? { latitude: coordinate?.latitude ?? null, longitude: coordinate?.longitude ?? null } : {}),
      ...(!luogoCambiato && coordinate ? coordinate : {}),
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

  /*
   * Il punteggio dipende da comune, zona, tipologia, prezzo e metratura:
   * cambiarne uno senza ricalcolare lascerebbe in scheda abbinamenti che i
   * dati attuali non giustificano piu'.
   */
  const criteriCambiati =
    luogoCambiato ||
    (d.type !== undefined && d.type !== attuale.type) ||
    (d.squareMeters !== undefined && d.squareMeters !== attuale.squareMeters);

  if (criteriCambiati && ribasso === null) {
    await runRadarMatching(organizationId, id);
  }

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

  return NextResponse.json({
    item,
    priceDropPct: ribasso,
    nuoviAbbinamenti,
    coordinateAggiornate: luogoCambiato,
  });
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
