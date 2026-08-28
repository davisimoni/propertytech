import type { ContractType, EnergyClass, PropertyType } from "@prisma/client";
import { AI_DISCLAIMER_SHORT } from "@/lib/compliance";
import { absoluteImageUrl } from "@/lib/listings/property-images";

/**
 * Feed XML per i portali immobiliari.
 *
 * **Non esiste un tracciato unico** per Immobiliare.it, Idealista e Casa.it:
 * ogni portale pubblica il proprio, con nomi di campo e vocabolari diversi. Il
 * file prodotto qui segue la struttura più diffusa in Italia — quella dei feed
 * "annunci" usata da Immobiliare.it e accettata da buona parte dei gestionali
 * — e va comunque confermata con il referente tecnico del portale prima del
 * primo caricamento massivo.
 *
 * La generazione è isolata in un modulo puro proprio per questo: aggiungere un
 * secondo tracciato significa aggiungere una funzione qui, senza toccare né la
 * UI né le rotte.
 */

export interface PortalListingInput {
  reference: string;
  title: string;
  contract: ContractType;
  type: PropertyType;
  comune: string;
  provincia?: string | null;
  zona?: string | null;
  indirizzo?: string | null;
  priceEur: number;
  squareMeters: number;
  rooms?: number | null;
  bathrooms?: number | null;
  floor?: string | null;
  energyClass?: EnergyClass | null;
  description?: string | null;
  /** URL delle fotografie, in ordine di pubblicazione: la prima è la copertina. */
  images?: string[];
}

/** Vocabolario delle categorie atteso dai feed dei portali italiani. */
const CATEGORY_BY_TYPE: Record<PropertyType, string> = {
  APPARTAMENTO: "Appartamento",
  ATTICO: "Attico",
  VILLA: "Villa",
  VILLETTA: "Villetta a schiera",
  LOFT: "Loft",
  RUSTICO: "Rustico",
  TERRENO: "Terreno",
  NEGOZIO: "Negozio",
  UFFICIO: "Ufficio",
  BOX: "Box",
  ALTRO: "Altro",
};

const CONTRACT_BY_TYPE: Record<ContractType, string> = {
  VENDITA: "Vendita",
  AFFITTO: "Affitto",
};

/**
 * Neutralizza i caratteri riservati dell'XML.
 *
 * Senza questo, un titolo con "Trilocale <ristrutturato> & luminoso" produce
 * un file malformato che il portale scarta in blocco — insieme a tutti gli
 * altri annunci del feed.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Testo lungo dentro CDATA: le descrizioni contengono a piene mani
 * apostrofi, virgolette e a capo.
 *
 * La sequenza `]]>` va spezzata, altrimenti chiuderebbe la sezione in
 * anticipo e romperebbe il documento.
 */
function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

/** Elemento semplice, omesso quando il valore non c'è: i portali preferiscono
 *  un campo assente a un campo vuoto. */
function tag(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text) return "";
  return `    <${name}>${escapeXml(text)}</${name}>`;
}

/**
 * Blocco delle fotografie.
 *
 * I nomi dei tag restano in italiano come il resto del documento. La struttura
 * — contenitore più un elemento per immagine con l'URL dentro — è quella che
 * i tracciati dei portali condividono; i nomi esatti no, e vanno confermati
 * col referente tecnico del portale come tutto il resto del file.
 *
 * Gli URL sono resi **assoluti**: a scaricarli è un server del portale, che
 * non ha idea di quale sia la nostra origine. Un percorso relativo qui
 * produrrebbe un annuncio senza foto senza che nulla segnali un errore.
 */
function imagesXml(images: string[] | undefined, origin: string): string {
  if (!images || images.length === 0) return "";

  const items = images.map((image) =>
    [
      "      <immagine>",
      `        <url>${escapeXml(absoluteImageUrl(image, origin))}</url>`,
      "      </immagine>",
    ].join("\n")
  );

  return ["    <immagini>", ...items, "    </immagini>"].join("\n");
}

function listingXml(listing: PortalListingInput, origin: string): string {
  const rows = [
    tag("riferimento", listing.reference),
    tag("titolo", listing.title),
    tag("categoria", CATEGORY_BY_TYPE[listing.type]),
    tag("contratto", CONTRACT_BY_TYPE[listing.contract]),
    tag("prezzo", listing.priceEur),
    tag("superficie", listing.squareMeters),
    tag("locali", listing.rooms),
    tag("bagni", listing.bathrooms),
    tag("piano", listing.floor),
    tag("classeEnergetica", listing.energyClass),
    tag("comune", listing.comune),
    tag("provincia", listing.provincia),
    tag("zona", listing.zona),
    tag("indirizzo", listing.indirizzo),
  ].filter(Boolean);

  // Il testo è generato dall'AI (Modulo 3): il disclaimer viaggia dentro la
  // descrizione stessa, non solo a video, altrimenti non arriva sul portale
  // insieme all'annuncio (CLAUDE.md §5).
  const description = listing.description?.trim()
    ? `    <descrizione>${cdata(`${listing.description.trim()}\n\n---\n${AI_DISCLAIMER_SHORT}`)}</descrizione>`
    : "";

  return [
    "  <annuncio>",
    ...rows,
    description,
    imagesXml(listing.images, origin),
    "  </annuncio>",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Documento completo pronto al caricamento.
 *
 * `generatedAt` è iniettabile per rendere l'output deterministico nei test:
 * un timestamp preso dall'orologio renderebbe impossibile confrontare due
 * esecuzioni.
 *
 * `origin` è obbligatorio e non ha un ripiego: serve a rendere assoluti gli
 * URL delle foto, e un valore di comodo produrrebbe un feed che il portale
 * accetta pubblicando annunci ciechi. Meglio non compilare.
 */
export function buildPortalFeed(
  listings: PortalListingInput[],
  options: { agencyName: string; origin: string; generatedAt?: Date }
): string {
  const generatedAt = (options.generatedAt ?? new Date()).toISOString();

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<annunci>",
    `  <agenzia>${escapeXml(options.agencyName)}</agenzia>`,
    `  <dataGenerazione>${generatedAt}</dataGenerazione>`,
    ...listings.map((listing) => listingXml(listing, options.origin)),
    "</annunci>",
    "",
  ].join("\n");
}

/** Nome file suggerito: "annunci-portali-2026-08-06.xml". */
export function portalFeedFileName(now: Date = new Date()): string {
  return `annunci-portali-${now.toISOString().slice(0, 10)}.xml`;
}
