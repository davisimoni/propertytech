import type { Property } from "@prisma/client";
import {
  CONTRACT_LABELS,
  PROPERTY_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
} from "./property-fields";

/**
 * Export del portafoglio in CSV. Stessa forma di `lib/leads/export.ts` e
 * `lib/radar/export.ts` — separatore `;`, BOM UTF-8, celle neutralizzate
 * contro la CSV injection — e stessa ragione: un formato che l'agenzia apre
 * in Excel, non un formato tecnico. È anche il file che, ricaricato
 * dall'import, ricrea lo stesso portafoglio: le colonne coincidono con
 * `PROPERTY_CSV_COLUMNS` per le voci che l'import accetta.
 */

const SEPARATOR = ";";
const BOM = "﻿";

const COLUMNS = [
  "Riferimento",
  "Titolo",
  "Contratto",
  "Tipologia",
  "Comune",
  "Provincia",
  "Zona",
  "Indirizzo",
  "Prezzo",
  "Superficie mq",
  "Locali",
  "Bagni",
  "Piano",
  "Classe Energetica",
  "Descrizione",
  "Stato",
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

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";

  const text = String(value);
  const neutralized = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  return `"${neutralized.replace(/"/g, '""')}"`;
}

export function buildPropertiesCsv(properties: Property[]): string {
  const rows = properties.map((property) =>
    [
      property.reference,
      property.title,
      CONTRACT_LABELS[property.contract],
      PROPERTY_TYPE_LABELS[property.type],
      property.comune,
      property.provincia,
      property.zona,
      property.indirizzo,
      property.priceEur,
      property.squareMeters,
      property.rooms,
      property.bathrooms,
      property.floor,
      property.energyClass,
      property.description,
      PROPERTY_STATUS_LABELS[property.status],
      DATE_TIME_FORMAT.format(property.createdAt),
    ]
      .map(escapeCell)
      .join(SEPARATOR)
  );

  return BOM + [COLUMNS.map(escapeCell).join(SEPARATOR), ...rows].join("\r\n") + "\r\n";
}

/** Nome file con la data del giorno. */
export function propertiesCsvFileName(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  return `portafoglio-propertytech-${iso}.csv`;
}
