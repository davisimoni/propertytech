import type { Lead, SellerCategory } from "@prisma/client";
import { PORTAL_SOURCE_LABELS, QUALIFICATION_STATUS_LABELS } from "@/lib/whatsapp/types";
import { SELLER_CATEGORY_LABELS } from "@/lib/whatsapp/portfolio";

/**
 * Export dei lead in CSV, pensato per essere aperto in Excel italiano.
 *
 * Due scelte che sembrano dettagli ma decidono se il file è utilizzabile:
 * il separatore `;` (Excel in locale italiano interpreta la virgola come
 * separatore decimale e riverserebbe tutto in una colonna sola) e il BOM UTF-8
 * in testa (senza, "Città" e "Perché" arrivano illeggibili).
 */

/** Separatore atteso da Excel in locale italiano. */
const SEPARATOR = ";";

/** Byte Order Mark: fa riconoscere a Excel la codifica UTF-8. */
const BOM = "﻿";

const COLUMNS = [
  "Nome Cliente",
  "Telefono",
  "Fonte",
  "Immobile",
  "Stato Qualificazione",
  "Mutuo/Liquidità",
  "Deve vendere prima",
  "Tempistica",
  "Budget",
  "Immobili posseduti",
  "Categoria venditore",
  "Appuntamento",
  "Appuntamento confermato",
  "Esportato al gestionale",
  "Creato il",
] as const;

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

/**
 * Mette al sicuro un valore dentro una cella CSV.
 *
 * Il prefisso con apostrofo sui valori che iniziano con `=`, `+`, `-` o `@`
 * neutralizza la CSV injection: senza, una cella con `=HYPERLINK(...)` viene
 * eseguita come formula all'apertura del file, e il nome di un lead arriva da
 * una fonte esterna che non controlliamo.
 */
function escapeCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";

  const text = String(value);
  const neutralized = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  return `"${neutralized.replace(/"/g, '""')}"`;
}

function formatBoolean(value: boolean | null): string {
  if (value === null) return "";
  return value ? "Sì" : "No";
}

function formatDate(value: Date | null): string {
  return value ? DATE_TIME_FORMAT.format(value) : "";
}

function formatCategory(value: SellerCategory | null): string {
  return value ? SELLER_CATEGORY_LABELS[value] : "";
}

/** Genera il contenuto CSV completo, intestazione inclusa. */
export function buildLeadsCsv(leads: Lead[]): string {
  const rows = leads.map((lead) =>
    [
      lead.clientName,
      lead.clientPhone,
      PORTAL_SOURCE_LABELS[lead.portalSource],
      lead.propertyRef,
      QUALIFICATION_STATUS_LABELS[lead.qualificationStatus],
      formatBoolean(lead.mortgageApproved),
      formatBoolean(lead.mustSellFirst),
      lead.timeframe,
      lead.budget,
      lead.ownedPropertiesCount === null ? "" : String(lead.ownedPropertiesCount),
      formatCategory(lead.sellerCategory),
      formatDate(lead.appointmentSlot),
      formatBoolean(lead.appointmentConfirmed),
      formatDate(lead.crmDeliveredAt),
      formatDate(lead.createdAt),
    ]
      .map(escapeCell)
      .join(SEPARATOR)
  );

  // CRLF: è quello che Excel si aspetta su Windows.
  return BOM + [COLUMNS.map(escapeCell).join(SEPARATOR), ...rows].join("\r\n") + "\r\n";
}

/** Nome file con la data del giorno: "lead-propertytech-2026-08-04.csv". */
export function csvFileName(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  return `lead-propertytech-${iso}.csv`;
}
