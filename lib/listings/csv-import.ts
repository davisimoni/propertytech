import {
  CONTRACT_LABELS,
  ENERGY_CLASSES,
  PROPERTY_TYPE_LABELS,
  propertyFieldsSchema,
  type PropertyFields,
} from "./property-fields";
import type { EnergyClass } from "@prisma/client";

/**
 * Import CSV del portafoglio immobili.
 *
 * Modulo puro e client-safe: la stessa lettura serve all'anteprima nel
 * browser (righe valide/con errore, prima di spedire nulla) e alla rotta che
 * scrive a database. Un parser proprio e non una libreria: il formato che
 * serve — separatore che si autoriconosce, virgolette, BOM — è poca cosa, e
 * un'agenzia che scarica il template e lo riempie non produce mai i casi che
 * uno standard più ampio dovrebbe coprire.
 *
 * Colonne fisse e non una mappatura configurabile: un'agenzia che arriva con
 * un portafoglio in Excel deve poter scaricare il modello, incollarci i dati
 * e ricaricarlo, non progettare una corrispondenza fra colonne. È la stessa
 * scelta di "zero configurazione" del resto del prodotto.
 */

export interface PropertyCsvColumn {
  key:
    | "reference"
    | "title"
    | "contract"
    | "type"
    | "comune"
    | "provincia"
    | "zona"
    | "indirizzo"
    | "priceEur"
    | "squareMeters"
    | "rooms"
    | "bathrooms"
    | "floor"
    | "energyClass"
    | "description";
  label: string;
  required: boolean;
  example: string;
}

export const PROPERTY_CSV_COLUMNS: PropertyCsvColumn[] = [
  { key: "reference", label: "Riferimento", required: true, example: "RIF-001" },
  { key: "title", label: "Titolo", required: true, example: "Trilocale luminoso zona centro" },
  { key: "contract", label: "Contratto", required: true, example: "Vendita" },
  { key: "type", label: "Tipologia", required: true, example: "Appartamento" },
  { key: "comune", label: "Comune", required: true, example: "Vignola" },
  { key: "provincia", label: "Provincia", required: false, example: "MO" },
  { key: "zona", label: "Zona", required: false, example: "Centro" },
  { key: "indirizzo", label: "Indirizzo", required: false, example: "Via Roma 12" },
  { key: "priceEur", label: "Prezzo", required: true, example: "185000" },
  { key: "squareMeters", label: "Superficie mq", required: true, example: "95" },
  { key: "rooms", label: "Locali", required: false, example: "4" },
  { key: "bathrooms", label: "Bagni", required: false, example: "2" },
  { key: "floor", label: "Piano", required: false, example: "2" },
  { key: "energyClass", label: "Classe Energetica", required: false, example: "B" },
  { key: "description", label: "Descrizione", required: false, example: "" },
];

const SEPARATORS = [";", ","] as const;

/** Toglie il BOM UTF-8 in testa, se presente: Excel lo scrive, `split` no lo leva da solo. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Parser CSV minimo con supporto a virgolette e newline nella cella.
 * Non usa `split`: una cella può contenere il separatore o un ritorno a capo
 * fra virgolette, e `split` la spezzerebbe a metà.
 */
function parseRows(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === separator) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.some((v) => v.trim() !== "")) rows.push(row);
  }

  return rows;
}

/** Sceglie `;` o `,` guardando quale spezza la riga d'intestazione in più colonne. */
function detectSeparator(headerLine: string): string {
  let best: string = SEPARATORS[0];
  let bestCount = -1;
  for (const sep of SEPARATORS) {
    const count = headerLine.split(sep).length;
    if (count > bestCount) {
      best = sep;
      bestCount = count;
    }
  }
  return best;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function findEnergyClass(value: string): EnergyClass | null {
  const normalized = value.trim().toUpperCase();
  return (ENERGY_CLASSES as string[]).includes(normalized) ? (normalized as EnergyClass) : null;
}

/**
 * Confronto per i valori di un'enum (Contratto, Tipologia), non per le
 * intestazioni di colonna: qui gli spazi non contano — "Box/Garage" e "Box /
 * Garage" devono valere lo stesso — perché chi compila un Excel a mano non
 * riproduce mai la punteggiatura esatta di un'etichetta.
 */
function normalizeEnumValue(value: string): string {
  return normalizeHeader(value).replace(/\s+/g, "");
}

function findContract(value: string): "VENDITA" | "AFFITTO" | null {
  const normalized = normalizeEnumValue(value);
  for (const [key, label] of Object.entries(CONTRACT_LABELS)) {
    if (normalizeEnumValue(label) === normalized || key.toLowerCase() === normalized) {
      return key as "VENDITA" | "AFFITTO";
    }
  }
  return null;
}

function findPropertyType(value: string): keyof typeof PROPERTY_TYPE_LABELS | null {
  const normalized = normalizeEnumValue(value);
  for (const [key, label] of Object.entries(PROPERTY_TYPE_LABELS)) {
    if (normalizeEnumValue(label) === normalized || key.toLowerCase() === normalized) {
      return key as keyof typeof PROPERTY_TYPE_LABELS;
    }
  }
  return null;
}

/** Un numero da una cella: accetta sia "185000" sia "185.000" sia "185000,00". */
function parseNumberCell(value: string): number | null {
  const cleaned = value.trim().replace(/\./g, "").replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export interface ParsedPropertyRow {
  /** Numero di riga nel file originale (1 = prima riga dati, dopo l'intestazione). */
  line: number;
  data: PropertyFields & { title: string; description?: string };
}

export interface RowError {
  line: number;
  reference: string;
  message: string;
}

export interface PropertyCsvParseResult {
  valid: ParsedPropertyRow[];
  errors: RowError[];
  /** `true` quando l'intestazione non contiene le colonne obbligatorie: il file probabilmente non è il template. */
  headerMismatch: boolean;
}

/** Interpreta il CSV caricato, riga per riga: valide da una parte, errori dall'altra. */
export function parsePropertyCsv(rawText: string): PropertyCsvParseResult {
  const text = stripBom(rawText);
  const lines = text.split(/\r\n|\r|\n/);
  const headerLine = lines.find((l) => l.trim() !== "") ?? "";
  const separator = detectSeparator(headerLine);
  const rows = parseRows(text, separator);

  if (rows.length === 0) {
    return { valid: [], errors: [], headerMismatch: true };
  }

  const header = (rows[0] ?? []).map(normalizeHeader);
  const columnIndex = new Map<PropertyCsvColumn["key"], number>();
  for (const column of PROPERTY_CSV_COLUMNS) {
    const idx = header.indexOf(normalizeHeader(column.label));
    if (idx !== -1) columnIndex.set(column.key, idx);
  }

  const requiredMissing = PROPERTY_CSV_COLUMNS.filter(
    (c) => c.required && !columnIndex.has(c.key)
  );
  if (requiredMissing.length > 0) {
    return { valid: [], errors: [], headerMismatch: true };
  }

  const valid: ParsedPropertyRow[] = [];
  const errors: RowError[] = [];

  const cell = (row: string[], key: PropertyCsvColumn["key"]): string => {
    const idx = columnIndex.get(key);
    return idx === undefined ? "" : (row[idx] ?? "").trim();
  };

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const line = i + 1; // +1: la riga 1 e' l'intestazione, la prima riga dati e' la 2 nel file reale
    const reference = cell(row, "reference");
    const title = cell(row, "title");

    // Contratto e tipologia si riconoscono prima di tutto il resto, con un
    // messaggio che nomina il valore letto: "non valido" generico non aiuta
    // chi ha scritto "vendite" per un refuso.
    const contractRaw = cell(row, "contract");
    const contract = findContract(contractRaw);
    if (!contractRaw) {
      errors.push({ line, reference, message: "Contratto mancante." });
      continue;
    }
    if (!contract) {
      errors.push({
        line,
        reference,
        message: `Contratto "${contractRaw}" non riconosciuto (usa Vendita o Affitto).`,
      });
      continue;
    }

    const typeRaw = cell(row, "type");
    const type = findPropertyType(typeRaw);
    if (!typeRaw) {
      errors.push({ line, reference, message: "Tipologia mancante." });
      continue;
    }
    if (!type) {
      errors.push({ line, reference, message: `Tipologia "${typeRaw}" non riconosciuta.` });
      continue;
    }

    if (title.trim().length < 3) {
      errors.push({ line, reference, message: "Titolo mancante o troppo corto." });
      continue;
    }

    const fields = {
      reference,
      contract,
      type,
      comune: cell(row, "comune"),
      provincia: cell(row, "provincia") || undefined,
      zona: cell(row, "zona") || undefined,
      indirizzo: cell(row, "indirizzo") || undefined,
      priceEur: parseNumberCell(cell(row, "priceEur")) ?? undefined,
      squareMeters: parseNumberCell(cell(row, "squareMeters")) ?? undefined,
      rooms: (() => {
        const n = parseNumberCell(cell(row, "rooms"));
        return n === null ? undefined : Math.round(n);
      })(),
      bathrooms: (() => {
        const n = parseNumberCell(cell(row, "bathrooms"));
        return n === null ? undefined : Math.round(n);
      })(),
      floor: cell(row, "floor") || undefined,
      energyClass: (() => {
        const raw = cell(row, "energyClass");
        return raw ? (findEnergyClass(raw) ?? undefined) : undefined;
      })(),
    };

    // Lo stesso schema che valida il form: prezzo e superficie obbligatori e
    // positivi, lunghezze massime dei campi testo. Un esito sì/no per riga,
    // il dettaglio è il primo problema trovato.
    const parsed = propertyFieldsSchema.safeParse(fields);
    if (!parsed.success) {
      errors.push({
        line,
        reference,
        message: parsed.error.issues[0]?.message ?? "Riga non valida.",
      });
      continue;
    }

    valid.push({
      line,
      data: {
        ...parsed.data,
        title,
        description: cell(row, "description") || undefined,
      },
    });
  }

  return { valid, errors, headerMismatch: false };
}

const TEMPLATE_SEPARATOR = ";";
const BOM = "﻿";

function escapeCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Template scaricabile: intestazione con i nomi attesi più una riga d'esempio. */
export function buildPropertyCsvTemplate(): string {
  const header = PROPERTY_CSV_COLUMNS.map((c) => escapeCell(c.label)).join(TEMPLATE_SEPARATOR);
  const example = PROPERTY_CSV_COLUMNS.map((c) => escapeCell(c.example)).join(TEMPLATE_SEPARATOR);
  return BOM + [header, example].join("\r\n") + "\r\n";
}
