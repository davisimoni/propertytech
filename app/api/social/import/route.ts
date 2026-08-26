import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { checkFeatureAccess } from "@/lib/feature-access";
import { importListing, ListingImportError } from "@/lib/ai/listing-import";

/**
 * Resta il massimo consentito anche sul piano Hobby: un annuncio lungo può
 * impegnare il modello per parecchi secondi, e col limite predefinito di
 * Vercel la funzione verrebbe interrotta a metà proprio sui testi più
 * corposi, restituendo un errore generico invece del risultato.
 */
export const maxDuration = 60;

/**
 * Solo testo incollato: il recupero da link è stato rimosso perché i portali
 * italiani lo bloccano sistematicamente dagli IP di Vercel (vedi la nota in
 * `lib/ai/listing-import.ts`).
 */
const importSchema = z.object({
  rawText: z.string().trim().min(1, "Incolla il testo dell'annuncio").max(20_000),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // L'import fa parte del Social Multiplier: stesso gate del piano.
  const accessResponse = await checkFeatureAccess(session.user.organizationId, "socialMultiplier");
  if (accessResponse) {
    return accessResponse;
  }

  const body = await request.json().catch(() => null);
  const parsed = importSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_payload",
        message: parsed.error.issues[0]?.message ?? "Dati non validi.",
      },
      { status: 400 }
    );
  }

  try {
    const { listing } = await importListing(parsed.data);
    return NextResponse.json({ listing });
  } catch (error) {
    if (error instanceof ListingImportError) {
      // 502 quando è il servizio AI a non rispondere, 422 quando il testo
      // fornito non è utilizzabile: la richiesta era valida, è la fonte a non
      // bastare, e il messaggio dice cosa fare.
      const status = error.code === "upstream_error" ? 502 : 422;

      // Tag `[IMPORT-ERROR]`: una sola stringa da cercare nei log di Vercel
      // per trovare qualunque fallimento dell'import.
      console.error("[IMPORT-ERROR]", status, `${error.code}: ${error.message}`);

      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }

    console.error(
      "[IMPORT-ERROR]",
      500,
      error instanceof Error ? `${error.name}: ${error.message}` : "unknown"
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
