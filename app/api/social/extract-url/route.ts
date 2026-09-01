import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { checkFeatureAccess } from "@/lib/feature-access";
import { importListing, ListingImportError } from "@/lib/ai/listing-import";
import { extractListingTextFromUrl, UrlExtractError } from "@/lib/listings/url-extract";

/**
 * Compilazione della scheda immobile a partire da un link.
 *
 * Due passaggi in fila, e conta quale dei due fallisce: prima si scarica la
 * pagina e se ne ricava il testo (`url-extract`), poi lo si consegna allo
 * stesso parser che legge il testo incollato a mano (`listing-import`). Il
 * secondo passaggio non sa da dove arrivi il testo, ed è giusto così: un
 * annuncio è un annuncio, che l'agente lo abbia copiato o linkato.
 *
 * Quando è il portale a rifiutare, il messaggio che torna dice cosa fare —
 * incollare il testo — invece di lamentare un errore tecnico che l'agente non
 * può risolvere.
 */

/** Come per l'import da testo: il modello può impiegare parecchi secondi. */
export const maxDuration = 60;

const extractSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "Incolla il link dell'annuncio")
    .max(2000, "Il link è troppo lungo"),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Stesso gate dell'import da testo: è la stessa funzione, altra porta.
  const accessResponse = await checkFeatureAccess(session.user.organizationId, "socialMultiplier");
  if (accessResponse) {
    return accessResponse;
  }

  const body = await request.json().catch(() => null);
  const parsed = extractSchema.safeParse(body);

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
    const { rawText, finalUrl } = await extractListingTextFromUrl(parsed.data.url);
    const { listing } = await importListing({ rawText });

    /*
     * Torna anche il testo estratto, non solo i campi.
     *
     * Serve a riempire il riquadro sotto: se il modello ha letto male una
     * metratura, l'agente ha davanti la fonte da correggere invece di dover
     * riaprire il link e ricopiare tutto a mano. È anche l'unico modo di
     * capire, guardando, se dalla pagina è arrivato un annuncio o un menù.
     */
    return NextResponse.json({ listing, rawText, finalUrl });
  } catch (error) {
    if (error instanceof UrlExtractError) {
      // 422: la richiesta era valida, è la pagina a non essere utilizzabile.
      // Il messaggio è già scritto per l'agente e passa alla UI così com'è.
      console.error("[IMPORT-ERROR]", 422, `${error.code}: ${parsed.data.url}`);
      return NextResponse.json({ error: error.code, message: error.message }, { status: 422 });
    }

    if (error instanceof ListingImportError) {
      const status = error.code === "upstream_error" ? 502 : 422;
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
