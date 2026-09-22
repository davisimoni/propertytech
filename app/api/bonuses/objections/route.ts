import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { pianoCorrente } from "@/lib/feature-access";
import { bonusAccessibile } from "@/lib/bonuses";
import { generaObiezioni } from "@/lib/ai/objections";
import { contestoUtile, type ContestoImmobile } from "@/lib/ai/objections-schema";

/**
 * Obiezioni su misura per un immobile.
 *
 * # Il cancello è il bonus, ripetuto qui
 *
 * La pagina lo verifica già, ma la pagina è una schermata e questa è un'API:
 * chi conosce l'indirizzo la chiama senza passare di lì. Un controllo che vive
 * solo nell'interfaccia non è un controllo (CLAUDE.md §5).
 *
 * # Perché non consuma crediti
 *
 * I contatori del piano misurano conversazioni WhatsApp, documenti e note
 * vocali. Questa generazione vive dentro un bonus già riservato a un piano e
 * senza contatore: aggiungerne uno qui significherebbe inventare una valuta
 * che il listino non dichiara, e l'agente la scoprirebbe quando smette di
 * funzionare qualcosa che credeva incluso.
 *
 * # I dati dell'immobile si rileggono dal database
 *
 * Quando arriva un `propertyId`, le caratteristiche si prendono dalla scheda,
 * non dal corpo della richiesta: il browser ce le avrebbe anche, ma leggerle
 * qui è ciò che garantisce che siano **di quell'agenzia** e che siano quelle
 * vere. I campi che in scheda non esistono (punti di forza e criticità) sono
 * gli unici che l'agente scrive a mano, e arrivano dal corpo.
 */
export const maxDuration = 60;

const schema = z.object({
  propertyId: z.string().trim().min(1).optional(),
  tipologia: z.string().trim().max(120).optional(),
  prezzoEur: z.number().int().positive().max(1_000_000_000).nullable().optional(),
  comune: z.string().trim().max(120).optional(),
  zona: z.string().trim().max(160).optional(),
  superficie: z.number().int().positive().max(100_000).nullable().optional(),
  puntiDiForza: z.string().trim().max(1500).optional(),
  criticita: z.string().trim().max(1500).optional(),
  /** Nome del proprietario, prezzo, provvigione: il contorno della trattativa. */
  trattativa: z.string().trim().max(600).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  const piano = await pianoCorrente(organizationId);

  if (!bonusAccessibile(piano, "script-obiezioni")) {
    return NextResponse.json(
      {
        error: "feature_not_in_plan",
        resource: "script-obiezioni",
        message: "Il Kit Script e Obiezioni non è incluso nel tuo piano.",
      },
      { status: 402 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", message: parsed.error.issues[0]?.message ?? "Dati non validi." },
      { status: 400 }
    );
  }

  const dati = parsed.data;
  let contesto: ContestoImmobile = {
    tipologia: dati.tipologia ?? null,
    prezzoEur: dati.prezzoEur ?? null,
    comune: dati.comune ?? null,
    zona: dati.zona ?? null,
    superficie: dati.superficie ?? null,
    puntiDiForza: dati.puntiDiForza ?? null,
    criticita: dati.criticita ?? null,
  };

  if (dati.propertyId) {
    const immobile = await prisma.property.findFirst({
      where: { id: dati.propertyId, organizationId },
      select: {
        type: true,
        priceEur: true,
        comune: true,
        zona: true,
        indirizzo: true,
        squareMeters: true,
        rooms: true,
        bathrooms: true,
        floor: true,
        energyClass: true,
        description: true,
      },
    });

    if (!immobile) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    contesto = {
      ...contesto,
      tipologia: immobile.type,
      prezzoEur: immobile.priceEur,
      comune: immobile.comune,
      zona: immobile.zona ?? immobile.indirizzo,
      superficie: immobile.squareMeters,
      locali: immobile.rooms,
      bagni: immobile.bathrooms,
      piano: immobile.floor,
      classeEnergetica: immobile.energyClass,
      descrizione: immobile.description,
    };
  }

  if (!contestoUtile(contesto)) {
    return NextResponse.json(
      {
        error: "missing_context",
        message:
          "Servono almeno il prezzo e la zona, oppure una criticità, per calcolare obiezioni su misura.",
      },
      { status: 400 }
    );
  }

  const esito = await generaObiezioni(contesto, dati.trattativa);

  if (!esito.ok) {
    return NextResponse.json({ error: "ai_error", message: esito.errore }, { status: 502 });
  }

  return NextResponse.json({ obiezioni: esito.obiezioni });
}
