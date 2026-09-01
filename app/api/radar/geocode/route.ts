import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Coordinate a partire da comune e zona.
 *
 * # Perché passa dal server e non dal browser
 *
 * Nominatim è il servizio dell'OpenStreetMap Foundation e ha una politica
 * d'uso precisa: una richiesta al secondo e uno User-Agent che identifichi
 * l'applicazione. Chiamarlo dal browser significherebbe non poter garantire
 * né l'una né l'altro, e in più manderebbe l'indirizzo IP di ogni agente a un
 * servizio terzo per un'operazione che riguarda l'agenzia, non lui.
 *
 * # Perché una alla volta, su richiesta
 *
 * Nessuna geocodifica in blocco e nessuna automatica al salvataggio:
 * l'agente preme un tasto per un lotto. È ciò che tiene la cosa dentro la
 * politica d'uso di un servizio gratuito che non stiamo pagando.
 *
 * # Perché le coordinate non sono obbligatorie
 *
 * Se la ricerca non trova nulla — una frazione minuscola, un nome scritto in
 * modo insolito — il lotto si salva lo stesso e resta in elenco senza pin.
 * Bloccare l'inserimento perché un servizio esterno non riconosce un toponimo
 * sarebbe far dipendere il prodotto da un dettaglio che non conta.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const TIMEOUT_MS = 8_000;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const comune = (params.get("comune") ?? "").trim();
  const zona = (params.get("zona") ?? "").trim();

  if (comune.length < 2) {
    return NextResponse.json(
      { error: "invalid_query", message: "Indica almeno il comune." },
      { status: 400 }
    );
  }

  // `countrycodes=it`: il modulo riguarda il mercato italiano, e senza
  // vincolo "Vignola" può risolvere in un'altra parte del mondo.
  const url = new URL(NOMINATIM);
  url.searchParams.set("q", [zona, comune].filter(Boolean).join(", "));
  url.searchParams.set("countrycodes", "it");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  try {
    const response = await fetch(url, {
      headers: {
        // Richiesto dalla politica d'uso di Nominatim: un contatto a cui
        // scrivere se l'applicazione si comporta male.
        "User-Agent": "PropertyTech/1.0 (supporto@propertytechsolutions.net)",
        "Accept-Language": "it",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn("[RADAR-GEOCODE] Servizio non disponibile", { status: response.status });
      return NextResponse.json({ found: false });
    }

    const risultati = (await response.json()) as { lat?: string; lon?: string; display_name?: string }[];
    const primo = risultati[0];

    if (!primo?.lat || !primo?.lon) {
      return NextResponse.json({ found: false });
    }

    return NextResponse.json({
      found: true,
      latitude: Number(primo.lat),
      longitude: Number(primo.lon),
      label: primo.display_name ?? null,
    });
  } catch (error) {
    // Non è un errore dell'agente e non deve bloccarlo: il lotto si salva
    // comunque, semplicemente senza pin.
    console.warn("[RADAR-GEOCODE] Ricerca non riuscita", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ found: false });
  }
}
