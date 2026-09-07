/**
 * "Crea da zero": cinque campi rapidi, ricomposti nella stessa forma che il
 * generatore già accetta.
 *
 * # Perché non è una terza modalità per il server
 *
 * Perché il server ne ha già due — `propertyTitle` + `keyPoints`, oppure
 * `rawText` — e la prima è esattamente un titolo più una manciata di righe
 * descrittive: è la forma in cui un annuncio arriva quando l'agente lo scrive
 * a mano invece di incollarlo. "Crea da zero" non aggiunge una terza forma:
 * traduce cinque campi mirati nella forma che già c'è, così il generatore, lo
 * schema di validazione e il prompt restano quelli di sempre.
 *
 * Il titolo prende il campo "Tipologia e zona" così com'è — è già scritto
 * come un titolo ("Trilocale in centro storico, Bologna"). Gli altri quattro
 * diventano righe etichettate: la stessa forma con cui un "Nome:" o un
 * "Prezzo:" viene letto quando l'agente incolla il testo di un annuncio.
 */

export const PROPERTY_CONDITION_OPTIONS = [
  "RISTRUTTURATO",
  "BUONO_STATO",
  "DA_RISTRUTTURARE",
  "NUOVA_COSTRUZIONE",
] as const;

export type PropertyConditionOption = (typeof PROPERTY_CONDITION_OPTIONS)[number];

export const PROPERTY_CONDITION_LABELS: Record<PropertyConditionOption, string> = {
  RISTRUTTURATO: "Ristrutturato",
  BUONO_STATO: "Buono stato",
  DA_RISTRUTTURARE: "Da ristrutturare",
  NUOVA_COSTRUZIONE: "Nuova costruzione",
};

export interface ScratchListingFields {
  /** Es. "Trilocale in centro storico, Bologna". Diventa il titolo. */
  tipologiaZona: string;
  /** Es. "250.000€ — 90mq". */
  prezzoMq: string;
  /** Es. "3° piano con ascensore, terrazzo 15mq, luminoso". */
  pianoCaratteristiche: string;
  condition: PropertyConditionOption | "";
  /** Es. "Vicino alla stazione, garage incluso". */
  puntiForza: string;
}

export function emptyScratchListing(): ScratchListingFields {
  return { tipologiaZona: "", prezzoMq: "", pianoCaratteristiche: "", condition: "", puntiForza: "" };
}

/**
 * Ricompone i cinque campi in `propertyTitle` + `keyPoints`.
 *
 * Ogni riga compare solo se il campo è compilato: un campo vuoto etichettato
 * lo stesso ("Piano e caratteristiche: ") non aggiunge informazione e sposta
 * solo rumore nel prompt.
 */
export function composeScratchListing(fields: ScratchListingFields): {
  propertyTitle: string;
  keyPoints: string;
} {
  const righe = [
    fields.prezzoMq.trim() ? `Prezzo e metratura: ${fields.prezzoMq.trim()}` : null,
    fields.pianoCaratteristiche.trim()
      ? `Piano e caratteristiche: ${fields.pianoCaratteristiche.trim()}`
      : null,
    fields.condition ? `Stato immobile: ${PROPERTY_CONDITION_LABELS[fields.condition]}` : null,
    fields.puntiForza.trim() ? `Punti di forza: ${fields.puntiForza.trim()}` : null,
  ].filter((riga): riga is string => riga !== null);

  return {
    propertyTitle: fields.tipologiaZona.trim(),
    keyPoints: righe.join("\n"),
  };
}
