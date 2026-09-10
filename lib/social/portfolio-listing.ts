import type { PropertyType } from "@prisma/client";

/**
 * Compone titolo e punti chiave da un immobile già in portafoglio.
 *
 * # Perché non serve un campo nuovo nella richiesta
 *
 * Perché il generatore vuole due cose — un titolo e delle note — e non gli
 * interessa da dove arrivino: le scrive l'agente a mano, le compone la scheda
 * "Crea da zero" da cinque campi, oppure le compone questa da un immobile già
 * salvato. Inventare un terzo canale avrebbe significato insegnare al prompt
 * una fonte in più senza aggiungere nulla che non si possa già dire con le
 * note.
 *
 * # Perché salta i campi vuoti invece di scrivere "non disponibile"
 *
 * Perché il prompt di sistema vieta di riempire i vuoti con ipotesi, ma una
 * riga "Classe energetica: non disponibile" è comunque un'informazione che il
 * modello prova a usare — e finisce per scriverne nell'annuncio. Un campo che
 * manca si omette e basta: è la stessa regola che vale per il testo incollato.
 */

const TIPOLOGIA_LEGGIBILE: Record<PropertyType, string> = {
  APPARTAMENTO: "Appartamento",
  ATTICO: "Attico",
  VILLA: "Villa",
  VILLETTA: "Villetta",
  LOFT: "Loft",
  RUSTICO: "Rustico",
  TERRENO: "Terreno",
  NEGOZIO: "Negozio",
  UFFICIO: "Ufficio",
  BOX: "Box",
  ALTRO: "Immobile",
};

/** I campi dell'immobile che servono a comporre le note. */
export interface PortfolioListingSource {
  title: string;
  type: PropertyType;
  comune: string;
  zona: string | null;
  priceEur: number | null;
  squareMeters: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  energyClass: string | null;
  description: string | null;
}

export function composePortfolioListing(immobile: PortfolioListingSource): {
  propertyTitle: string;
  keyPoints: string;
} {
  const dove = [immobile.zona?.trim(), immobile.comune.trim()].filter(Boolean).join(", ");

  const propertyTitle =
    immobile.title?.trim() ||
    `${TIPOLOGIA_LEGGIBILE[immobile.type]}${dove ? ` a ${dove}` : ""}`;

  const righe: string[] = [];
  const aggiungi = (etichetta: string, valore: string | number | null | undefined) => {
    if (valore === null || valore === undefined) return;
    const testo = String(valore).trim();
    if (!testo) return;
    righe.push(`${etichetta}: ${testo}`);
  };

  aggiungi("Tipologia", TIPOLOGIA_LEGGIBILE[immobile.type]);
  aggiungi("Zona", dove);
  aggiungi("Superficie", immobile.squareMeters ? `${immobile.squareMeters} mq` : null);
  aggiungi("Prezzo", immobile.priceEur ? `${immobile.priceEur} €` : null);
  aggiungi("Locali", immobile.rooms);
  aggiungi("Bagni", immobile.bathrooms);
  aggiungi("Piano", immobile.floor);
  aggiungi("Classe energetica", immobile.energyClass);

  if (immobile.description?.trim()) {
    righe.push(`Descrizione in scheda: ${immobile.description.trim()}`);
  }

  return { propertyTitle, keyPoints: righe.join("\n") };
}
