import { z } from "zod";
import type { ContractType, EnergyClass, PropertyStatus, PropertyType } from "@prisma/client";

/**
 * Dati strutturati dell'immobile: quelli che i portali richiedono e che il
 * testo pubblicitario, da solo, non contiene.
 *
 * Modulo puro e client-safe: lo stesso schema valida il form nel browser e il
 * payload sul server, così i due non possono divergere.
 */

export const CONTRACT_TYPES: ContractType[] = ["VENDITA", "AFFITTO"];

/**
 * Stato commerciale, come lo chiama un agente.
 *
 * `PUBLISHED_STATUSES` sono gli stati che il feed esporta: stanno qui, accanto
 * alle etichette, perche' la UI e il feed devono dire la stessa cosa. Le rotte
 * li importano invece di riscrivere il filtro, cosi' cambiare la regola resta
 * una modifica sola.
 */
export const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  DRAFT: "Bozza",
  ACTIVE: "In vendita",
  RESERVED: "Sotto proposta",
  SOLD: "Venduto",
  ARCHIVED: "Archiviato",
};

/** Descrizione dell'effetto sui portali, mostrata nel selettore. */
export const PROPERTY_STATUS_HINTS: Record<PropertyStatus, string> = {
  DRAFT: "Non ancora pubblicato sui portali",
  ACTIVE: "Pubblicato sui portali",
  RESERVED: "Resta pubblicato: raccoglie richieste di riserva",
  SOLD: "Ritirato dai portali",
  ARCHIVED: "Ritirato dai portali",
};

/**
 * Stati che finiscono nel feed XML verso i portali.
 *
 * `RESERVED` e' incluso di proposito: una proposta accettata non e' un rogito,
 * e ritirare l'annuncio durante la trattativa significa restare senza
 * alternative se salta. L'immobile resta visibile e continua a raccogliere
 * richieste di riserva, che e' esattamente il motivo per cui l'agenzia lo
 * segna "sotto proposta" invece di venduto.
 */
export const PUBLISHED_STATUSES = ["ACTIVE", "RESERVED"] as const satisfies readonly PropertyStatus[];

export function isPublishedStatus(status: PropertyStatus): boolean {
  return (PUBLISHED_STATUSES as readonly PropertyStatus[]).includes(status);
}

export const CONTRACT_LABELS: Record<ContractType, string> = {
  VENDITA: "Vendita",
  AFFITTO: "Affitto",
};

export const PROPERTY_TYPES: PropertyType[] = [
  "APPARTAMENTO",
  "ATTICO",
  "VILLA",
  "VILLETTA",
  "LOFT",
  "RUSTICO",
  "TERRENO",
  "NEGOZIO",
  "UFFICIO",
  "BOX",
  "ALTRO",
];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  APPARTAMENTO: "Appartamento",
  ATTICO: "Attico",
  VILLA: "Villa",
  VILLETTA: "Villetta a schiera",
  LOFT: "Loft",
  RUSTICO: "Rustico / Casale",
  TERRENO: "Terreno",
  NEGOZIO: "Negozio",
  UFFICIO: "Ufficio",
  BOX: "Box / Garage",
  ALTRO: "Altro",
};

export const ENERGY_CLASSES: EnergyClass[] = [
  "A4",
  "A3",
  "A2",
  "A1",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
];

/** Tetto difensivo: oltre è quasi certamente un errore di battitura. */
export const MAX_PRICE_EUR = 100_000_000;
export const MAX_SQUARE_METERS = 100_000;

export function isContractType(value: string): value is ContractType {
  return (CONTRACT_TYPES as string[]).includes(value);
}

export function isPropertyType(value: string): value is PropertyType {
  return (PROPERTY_TYPES as string[]).includes(value);
}

export function isEnergyClass(value: string): value is EnergyClass {
  return (ENERGY_CLASSES as string[]).includes(value);
}

/**
 * Campi strutturati richiesti per generare un feed valido.
 *
 * Obbligatori solo quelli che i portali rifiutano se mancanti: riferimento,
 * contratto, tipologia, comune, prezzo e superficie. Locali, bagni, piano e
 * classe energetica restano opzionali perché su un terreno o un box non hanno
 * senso, e imporli bloccherebbe casi legittimi.
 */
export const propertyFieldsSchema = z.object({
  reference: z.string().trim().min(1, "Inserisci il riferimento dell'immobile").max(40),
  contract: z.custom<ContractType>(
    (v) => typeof v === "string" && isContractType(v),
    "Tipo di contratto non valido"
  ),
  type: z.custom<PropertyType>(
    (v) => typeof v === "string" && isPropertyType(v),
    "Tipologia non valida"
  ),
  comune: z.string().trim().min(2, "Inserisci il comune").max(80),
  provincia: z.string().trim().max(40).optional(),
  zona: z.string().trim().max(80).optional(),
  indirizzo: z.string().trim().max(160).optional(),
  priceEur: z
    // Messaggio anche sul tipo, non solo sui vincoli: un campo svuotato arriva
    // come `undefined`, e senza questo l'agente leggerebbe il testo grezzo di
    // Zod in inglese.
    .number({ error: "Inserisci il prezzo" })
    .int("Il prezzo deve essere un numero intero")
    .positive("Il prezzo deve essere maggiore di zero")
    .max(MAX_PRICE_EUR, "Prezzo fuori scala"),
  squareMeters: z
    .number({ error: "Inserisci la superficie in metri quadri" })
    .int("La superficie deve essere un numero intero")
    .positive("La superficie deve essere maggiore di zero")
    .max(MAX_SQUARE_METERS, "Superficie fuori scala"),
  rooms: z.number().int().min(0).max(100).optional(),
  bathrooms: z.number().int().min(0).max(50).optional(),
  floor: z.string().trim().max(20).optional(),
  energyClass: z
    .custom<EnergyClass>((v) => typeof v === "string" && isEnergyClass(v), "Classe non valida")
    .optional(),
});

export type PropertyFields = z.infer<typeof propertyFieldsSchema>;

/**
 * Estrae un numero da un testo libero, per precompilare i campi a partire da
 * un annuncio importato: `"250.000 €"` → `250000`, `"80 mq"` → `80`.
 *
 * Interpreta la notazione italiana: il punto separa le migliaia, la virgola i
 * decimali. Invertirli trasformerebbe un immobile da 250.000 € in uno da 250.
 * Restituisce `null` quando non c'è nulla di utilizzabile, così il campo resta
 * vuoto invece di riempirsi di uno zero inventato.
 */
export function parseNumericHint(raw: string | null | undefined): number | null {
  if (!raw) return null;

  const digits = raw.replace(/[^\d.,]/g, "");
  if (!digits) return null;

  const normalized = digits.replace(/\./g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);

  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

/** Prezzo formattato per la UI: "250.000 €". */
export function formatPrice(priceEur: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(priceEur);
}
