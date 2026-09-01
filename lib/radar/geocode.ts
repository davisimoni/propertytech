import "server-only";

/**
 * Coordinate a partire da comune e zona.
 *
 * Estratta qui perché serve in due punti: la rotta che l'agente chiama dal
 * form e l'aggiornamento di un lotto, che deve rifare la ricerca quando il
 * comune cambia. Due copie divergerebbero al primo ritocco — e una delle due
 * finirebbe per mandare a Nominatim richieste senza lo User-Agent che la sua
 * politica d'uso richiede.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const TIMEOUT_MS = 8_000;

export interface Coordinate {
  latitude: number;
  longitude: number;
  label: string | null;
}

/**
 * Cerca la posizione. Non lancia mai: `null` quando non trova o non risponde.
 *
 * Un lotto senza coordinate resta valido e semplicemente non compare sulla
 * mappa: far fallire un salvataggio perché un servizio esterno non riconosce
 * un toponimo sarebbe far dipendere il prodotto da un dettaglio che non conta.
 */
export async function geocodeZona(comune: string, zona?: string | null): Promise<Coordinate | null> {
  if (comune.trim().length < 2) return null;

  const url = new URL(NOMINATIM);
  url.searchParams.set("q", [zona?.trim(), comune.trim()].filter(Boolean).join(", "));
  // Il modulo riguarda il mercato italiano: senza vincolo, "Vignola" può
  // risolvere dall'altra parte del mondo.
  url.searchParams.set("countrycodes", "it");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  try {
    const response = await fetch(url, {
      headers: {
        // Richiesto dalla politica d'uso: un contatto a cui scrivere se
        // l'applicazione si comporta male.
        "User-Agent": "PropertyTech/1.0 (supporto@propertytechsolutions.net)",
        "Accept-Language": "it",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const risultati = (await response.json()) as { lat?: string; lon?: string; display_name?: string }[];
    const primo = risultati[0];
    if (!primo?.lat || !primo?.lon) return null;

    return {
      latitude: Number(primo.lat),
      longitude: Number(primo.lon),
      label: primo.display_name ?? null,
    };
  } catch {
    return null;
  }
}
