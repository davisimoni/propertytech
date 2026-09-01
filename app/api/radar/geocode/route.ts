import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { geocodeZona } from "@/lib/radar/geocode";

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

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const comune = (params.get("comune") ?? "").trim();
  const zona = (params.get("zona") ?? "").trim();
  const address = (params.get("address") ?? "").trim();

  if (comune.length < 2) {
    return NextResponse.json(
      { error: "invalid_query", message: "Indica almeno il comune." },
      { status: 400 }
    );
  }

  const posizione = await geocodeZona(comune, zona, address);

  if (!posizione) {
    // Non e' un errore dell'agente: il lotto si salva comunque, senza pin.
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({ found: true, ...posizione });
}
