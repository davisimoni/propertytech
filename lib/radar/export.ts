import type { AuctionAppraisal, Prisma, RadarKind } from "@prisma/client";
import { computeRoi } from "./roi";
import { RISK_LABELS, OCCUPANCY_LABELS, SALE_TYPE_LABELS } from "./risk";
import { PROPERTY_TYPE_LABELS } from "@/lib/listings/property-fields";

/**
 * Export dei lotti Radar in CSV.
 *
 * Stessa forma di `lib/leads/export.ts` — separatore `;`, BOM UTF-8, celle
 * neutralizzate contro la CSV injection — perché è la stessa esigenza: un
 * file che l'agenzia apre in Excel per portarlo a chi il software non lo usa
 * (il titolare, un socio investitore), non un formato tecnico.
 */

const SEPARATOR = ";";
const BOM = "﻿";

const COLUMNS = [
  "Tipo",
  "Comune",
  "Zona",
  "Tipologia",
  "Mq",
  "Prezzo",
  "Valore di stima",
  "Rischio",
  "Stato occupazionale",
  "Modalità di vendita",
  "Cauzione %",
  "Difformità non sanabili",
  "Margine stimato",
  "ROI %",
  "Data vendita",
  "Lotto",
  "Creato il",
] as const;

const DATE_FORMAT = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Rome",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

function escapeCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";

  const text = String(value);
  const neutralized = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  return `"${neutralized.replace(/"/g, '""')}"`;
}

const RADAR_KIND_LABELS: Record<RadarKind, string> = {
  ASTA: "Asta",
  RIBASSO: "Ribasso",
};

export type RadarExportRow = {
  kind: RadarKind;
  comune: string;
  zona: string | null;
  type: keyof typeof PROPERTY_TYPE_LABELS;
  squareMeters: number;
  priceEur: number;
  basePriceEur: number | null;
  transferCostsEur: number | null;
  renovationCostEur: number | null;
  marketValueEur: number | null;
  monthlyRentEur: number | null;
  auctionDate: Date | null;
  lotto: string | null;
  createdAt: Date;
  appraisal: Pick<AuctionAppraisal, "risk" | "occupancy" | "saleType" | "depositPct" | "irregularities"> | null;
};

/** Quante difformità dell'array il perito dichiara esplicitamente non sanabili. */
function countNonSanabili(irregularities: string[]): number {
  return irregularities.filter((v) => /non\s+(?:è|e'|e)?\s*sanabil/i.test(v)).length;
}

/** Genera il contenuto CSV completo, intestazione inclusa. */
export function buildRadarCsv(items: RadarExportRow[]): string {
  const rows = items.map((item) => {
    const conti = computeRoi({
      priceEur: item.priceEur,
      transferCostsEur: item.transferCostsEur,
      renovationCostEur: item.renovationCostEur,
      marketValueEur: item.marketValueEur,
      monthlyRentEur: item.monthlyRentEur,
    });

    return [
      RADAR_KIND_LABELS[item.kind],
      item.comune,
      item.zona,
      PROPERTY_TYPE_LABELS[item.type],
      String(item.squareMeters),
      String(item.priceEur),
      item.basePriceEur === null ? "" : String(item.basePriceEur),
      item.appraisal ? RISK_LABELS[item.appraisal.risk] : "",
      item.appraisal ? OCCUPANCY_LABELS[item.appraisal.occupancy] : "",
      item.appraisal ? SALE_TYPE_LABELS[item.appraisal.saleType] : "",
      item.appraisal?.depositPct === null || item.appraisal?.depositPct === undefined
        ? ""
        : String(item.appraisal.depositPct),
      item.appraisal ? String(countNonSanabili(item.appraisal.irregularities)) : "",
      conti.flipMarginEur === null ? "" : String(conti.flipMarginEur),
      conti.flipRoiPct === null ? "" : String(conti.flipRoiPct),
      item.auctionDate ? DATE_FORMAT.format(item.auctionDate) : "",
      item.lotto,
      DATE_TIME_FORMAT.format(item.createdAt),
    ]
      .map(escapeCell)
      .join(SEPARATOR);
  });

  return BOM + [COLUMNS.map(escapeCell).join(SEPARATOR), ...rows].join("\r\n") + "\r\n";
}

/** Nome file con la data del giorno. */
export function radarCsvFileName(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  return `radar-propertytech-${iso}.csv`;
}

/** Selezione Prisma minima che soddisfa `RadarExportRow`, per non sovra-leggere. */
export const RADAR_EXPORT_SELECT = {
  kind: true,
  comune: true,
  zona: true,
  type: true,
  squareMeters: true,
  priceEur: true,
  basePriceEur: true,
  transferCostsEur: true,
  renovationCostEur: true,
  marketValueEur: true,
  monthlyRentEur: true,
  auctionDate: true,
  lotto: true,
  createdAt: true,
  appraisal: {
    select: {
      risk: true,
      occupancy: true,
      saleType: true,
      depositPct: true,
      irregularities: true,
    },
  },
} satisfies Prisma.RadarPropertySelect;
