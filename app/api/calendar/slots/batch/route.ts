import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  AgendaLimitError,
  BatchTooLargeError,
  batchSlotsSchema,
  createSlotsBatch,
} from "@/lib/calendar-management";

/**
 * Creazione massiva di disponibilità (ricorrenza settimanale e multi-data).
 *
 * Rotta separata da `/api/calendar/slots` invece di un ramo dentro il suo
 * POST: il corpo è un'altra cosa — criteri di ricorrenza, non un singolo
 * orario — e uno schema che dovesse accettare entrambe le forme non
 * potrebbe più rifiutare con precisione né l'una né l'altra.
 *
 * Il tempo di risposta dipende dal calendario esterno, che viene interrogato
 * una volta per l'intero periodo: `maxDuration` alzato rispetto al default
 * per non troncare la scrittura quando Google risponde piano.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = batchSlotsSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const esito = await createSlotsBatch(session.user.organizationId, parsed.data);
    return NextResponse.json(esito, { status: 201 });
  } catch (error) {
    // Stesso 402 del percorso singolo: la UI intercetta il limite di agende
    // con un solo gestore, qualunque sia la rotta che lo ha incontrato.
    if (error instanceof AgendaLimitError) {
      return NextResponse.json(
        {
          error: "agenda_limit_exceeded",
          resource: "agendas",
          used: error.used,
          limit: error.limit,
        },
        { status: 402 }
      );
    }

    if (error instanceof BatchTooLargeError) {
      return NextResponse.json(
        {
          error: "batch_too_large",
          message: `Sono troppi slot in una volta sola (massimo ${error.massimo}). Restringi il periodo o allunga la durata dei singoli appuntamenti.`,
        },
        { status: 400 }
      );
    }

    console.error("[api/calendar/slots/batch] Unexpected error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
