import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { checkFeatureAccess } from "@/lib/feature-access";
import { importListing, ListingImportError } from "@/lib/ai/listing-import";

const importSchema = z
  .object({
    url: z.string().trim().max(2000).optional(),
    rawText: z.string().trim().max(20_000).optional(),
  })
  .refine((data) => Boolean(data.url) || Boolean(data.rawText), {
    message: "Inserisci un link oppure incolla il testo dell'annuncio",
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
      // Gli errori di recupero pagina sono 422: la richiesta era valida, è la
      // fonte a non essere utilizzabile, e il messaggio dice cosa fare.
      const status =
        error.code === "upstream_error" ? 502 : error.code === "blocked_url" ? 400 : 422;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }

    console.error("[api/social/import] Unexpected error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
