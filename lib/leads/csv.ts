/**
 * Lettore CSV, senza dipendenze esterne.
 *
 * PERCHÉ NON UNA LIBRERIA. L'unico lettore XLSX su npm (`xlsx@0.18.5`) ha due
 * avvisi di sicurezza *high* — prototype pollution e ReDoS — **senza versione
 * corretta pubblicata**: le correzioni stanno solo sul CDN del produttore. Dare
 * in pasto a quel codice i file che un'agenzia carica sarebbe imprudente, e il
 * CSV copre il caso reale: da Excel si esporta in un clic.
 *
 * Modulo puro, così i casi che rompono davvero gli importatori si possono
 * verificare senza un file su disco.
 */

/** Colonna che superi questa lunghezza è quasi certamente un file corrotto. */
const MAX_FIELD_LENGTH = 10_000;

export interface CsvTable {
  headers: string[];
  rows: string[][];
  /** Separatore riconosciuto: utile da mostrare in fase di anteprima. */
  delimiter: string;
}

/**
 * Riconosce il separatore contando le occorrenze fuori dalle virgolette.
 *
 * Serve davvero: Excel in italiano esporta con il **punto e virgola**, perché
 * la virgola è già il separatore decimale. Un importatore che assume la virgola
 * legge l'intero file come una colonna sola, e all'agenzia sembra rotto.
 */
export function detectDelimiter(sample: string): string {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = 0;

  for (const candidate of candidates) {
    let count = 0;
    let inQuotes = false;

    for (let i = 0; i < sample.length; i++) {
      const char = sample[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === candidate && !inQuotes) {
        count++;
      }
    }

    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  return best;
}

/**
 * Analizza il testo CSV in righe e colonne.
 *
 * Gestisce i casi che si incontrano nei file veri: virgolette, separatori e
 * a capo dentro un campo, virgolette raddoppiate come escape, terminatori di
 * riga CRLF e il BOM che Excel antepone ai file UTF-8.
 */
export function parseCsv(input: string, delimiter?: string): CsvTable {
  // Excel scrive il BOM in testa: lasciarlo renderebbe la prima intestazione
  // "﻿Nome", che non corrisponderebbe a nessuna colonna riconosciuta.
  const text = input.replace(/^﻿/, "");
  const sep = delimiter ?? detectDelimiter(text.slice(0, 5_000));

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        // Virgoletta raddoppiata: è una virgoletta letterale, non la chiusura.
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === sep) {
      row.push(field.slice(0, MAX_FIELD_LENGTH));
      field = "";
    } else if (char === "\n") {
      row.push(field.slice(0, MAX_FIELD_LENGTH));
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      // Il \r di CRLF si scarta: tenerlo lascerebbe uno spazio invisibile in
      // coda a ogni ultima colonna, e i confronti fallirebbero senza motivo
      // apparente.
      field += char;
    }
  }

  // Ultimo campo: un file può finire senza a capo.
  if (field.length > 0 || row.length > 0) {
    row.push(field.slice(0, MAX_FIELD_LENGTH));
    rows.push(row);
  }

  // Righe completamente vuote: le lascia in coda ogni foglio di calcolo.
  const meaningful = rows.filter((r) => r.some((cell) => cell.trim() !== ""));

  const headers = (meaningful.shift() ?? []).map((h) => h.trim());

  return { headers, rows: meaningful, delimiter: sep };
}
