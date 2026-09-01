import { z } from "zod";
import type { PropertyType } from "@prisma/client";

/**
 * Validazione di un lotto del Radar.
 *
 * # Perché vive qui e non dentro la rotta
 *
 * Perché si possa provare quella vera. Finché stava dentro `route.ts` — dove
 * Next accetta solo l'export dei metodi HTTP — l'unico modo di verificarla era
 * riscriverne una copia nel test, e una copia dice sempre di sì quando
 * l'originale dice di no. È esattamente così che il rifiuto "Invalid input" è
 * arrivato in produzione.
 *
 * # Il null è un valore, non un errore
 *
 * Il modulo invia `null` per un campo lasciato in bianco: in un corpo JSON è
 * la forma più onesta di "non c'è". Uno schema che accetta solo `undefined` o
 * la stringa vuota lo rifiuta con `invalid_union`, che Zod traduce in
 * "Invalid input" senza nominare il campo — e con cinque testi facoltativi
 * vuoti insieme, l'agente vede un errore che non gli dice niente su un modulo
 * che ha compilato bene.
 */

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

/** Testo facoltativo: assente, vuoto o `null` valgono tutti "non compilato". */
const testoFacoltativo = (max: number) =>
  z.string().trim().max(max).nullish().or(z.literal(""));

/** Numero facoltativo, con un messaggio che dice cosa fare. */
const numeroFacoltativo = () =>
  z.coerce.number({ error: "Inserisci un numero valido" }).int().positive().nullish();

export const radarPropertyCreateSchema = z.object({
  kind: z.enum(["ASTA", "RIBASSO"]),
  comune: z.string().trim().min(2, "Indica il comune").max(120),
  zona: testoFacoltativo(120),
  /** Indirizzo e civico: sposta il pin dal centro del comune al portone. */
  address: testoFacoltativo(200),
  type: z.enum(PROPERTY_TYPES as [PropertyType, ...PropertyType[]], {
    error: "Scegli una tipologia",
  }),
  priceEur: z.coerce
    .number({ error: "Inserisci un numero valido" })
    .int("Inserisci un numero intero")
    .positive("Il prezzo deve essere maggiore di zero"),
  squareMeters: z.coerce
    .number({ error: "Inserisci un numero valido" })
    .int("Inserisci un numero intero")
    .positive("Indica i metri quadri"),
  basePriceEur: numeroFacoltativo(),
  previousPriceEur: numeroFacoltativo(),
  /** Data dell'asta in formato ISO; `null` per i ribassi di mercato. */
  auctionDate: z.string().datetime("Data non valida").nullish(),
  lotto: testoFacoltativo(60),
  sourceUrl: z.string().trim().url("Indirizzo non valido").max(500).nullish().or(z.literal("")),
  notes: testoFacoltativo(2000),
  latitude: z.coerce.number().min(-90).max(90).nullish(),
  longitude: z.coerce.number().min(-180).max(180).nullish(),
});

export type RadarPropertyCreateInput = z.infer<typeof radarPropertyCreateSchema>;

/**
 * Errori raccolti per campo.
 *
 * Un messaggio unico in cima a quattordici campi non dice quale correggere, e
 * chi compila prova a caso finché non rinuncia. Il primo problema per campo
 * basta: elencarne tre sullo stesso input non aiuta a scriverlo giusto.
 */
export function raccogliErroriPerCampo(errore: z.ZodError): Record<string, string> {
  const perCampo: Record<string, string> = {};
  for (const problema of errore.issues) {
    const campo = problema.path.join(".");
    if (campo && !perCampo[campo]) perCampo[campo] = problema.message;
  }
  return perCampo;
}
