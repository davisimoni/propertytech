/**
 * Mappatura di una rubrica CSV sui campi del lead.
 *
 * Modulo puro: nessun database. La parte che sbaglia più facilmente non è
 * scrivere le righe, è capire quale colonna è quale e ridurre un numero di
 * telefono a una forma confrontabile — ed entrambe si verificano meglio senza
 * un database davanti.
 */

/** Campi del lead che l'importazione sa riempire. */
export type ImportField =
  | "firstName"
  | "lastName"
  | "fullName"
  | "phone"
  | "email"
  | "budget"
  | "zone";

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  firstName: "Nome",
  lastName: "Cognome",
  fullName: "Nome completo",
  phone: "Telefono",
  email: "Email",
  budget: "Budget",
  zone: "Zona",
};

export const IMPORT_FIELDS = Object.keys(IMPORT_FIELD_LABELS) as ImportField[];

/**
 * Intestazioni riconosciute per ciascun campo, in italiano e in inglese.
 *
 * Servono a proporre una mappatura già pronta: chi migra una rubrica di
 * ottocento contatti non deve abbinare sette colonne a mano per scoprire poi
 * che ne ha sbagliata una.
 */
const HEADER_HINTS: Record<ImportField, string[]> = {
  firstName: ["nome", "name", "firstname", "first name", "first_name"],
  lastName: ["cognome", "surname", "lastname", "last name", "last_name"],
  fullName: [
    "nome completo",
    "nominativo",
    "contatto",
    "cliente",
    "ragione sociale",
    "full name",
    "fullname",
  ],
  phone: [
    "telefono",
    "cellulare",
    "cell",
    "tel",
    "phone",
    "mobile",
    "whatsapp",
    "numero",
    "recapito",
  ],
  email: ["email", "e-mail", "mail", "posta elettronica", "indirizzo email"],
  budget: ["budget", "prezzo", "importo", "disponibilita", "disponibilità", "spesa"],
  zone: ["zona", "area", "quartiere", "citta", "città", "comune", "località", "localita", "city"],
};

/** Confronto insensibile ad accenti, maiuscole, spazi e punteggiatura. */
function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    // Segni diacritici scomposti da NFD: "città" e "citta" devono coincidere.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Propone l'abbinamento colonna → campo leggendo le intestazioni.
 *
 * Una colonna sola per campo: se due intestazioni puntano allo stesso campo
 * vince la prima, perché prendere l'ultima significherebbe che aggiungere una
 * colonna in coda al file cambia in silenzio il risultato dell'importazione.
 */
export function guessMapping(headers: string[]): Record<number, ImportField> {
  const mapping: Record<number, ImportField> = {};
  const taken = new Set<ImportField>();

  // Corrispondenza esatta prima di quella parziale: una colonna "Nome" non
  // deve finire su `fullName` solo perché "nome" compare anche in "nome
  // completo".
  for (const pass of ["exact", "partial"] as const) {
    headers.forEach((header, index) => {
      if (mapping[index] !== undefined) return;

      const normalized = normalizeHeader(header);
      if (!normalized) return;

      for (const field of IMPORT_FIELDS) {
        if (taken.has(field)) continue;

        const hints = HEADER_HINTS[field];
        const hit =
          pass === "exact"
            ? hints.includes(normalized)
            : hints.some((hint) => normalized.includes(hint));

        if (hit) {
          mapping[index] = field;
          taken.add(field);
          return;
        }
      }
    });
  }

  return mapping;
}

/**
 * Riduce un numero di telefono alla forma usata da WhatsApp: solo cifre, con
 * prefisso internazionale.
 *
 * È il punto più importante di questo file. In una rubrica italiana i numeri
 * stanno scritti come `333 1234567`, `+39 333 1234567`, `0039 333 1234567`.
 * WhatsApp li consegna sempre come `393331234567`: senza ricondurli alla stessa
 * forma, il contatto importato e la conversazione in arrivo diventerebbero due
 * lead distinti per la stessa persona, e l'agente la chiamerebbe due volte.
 */
export function normalizeImportedPhone(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, "");

  // Prefisso internazionale in forma `00`: equivale a `+`.
  if (digits.startsWith("00")) digits = digits.slice(2);
  digits = digits.replace(/\+/g, "");

  if (digits.length < 6) return null;

  // Già con prefisso italiano.
  if (digits.startsWith("39") && digits.length >= 11) return digits;

  // Cellulare italiano senza prefisso: comincia per 3 e ha 9 o 10 cifre.
  if (/^3\d{8,9}$/.test(digits)) return `39${digits}`;

  // Fisso italiano senza prefisso: comincia per 0.
  if (/^0\d{7,10}$/.test(digits)) return `39${digits}`;

  // Numero estero o formato non riconosciuto: si lascia com'è. Meglio
  // importarlo così che scartarlo, l'agente lo correggerà dalla scheda.
  return digits;
}

/** Riga grezza già interpretata, prima dei controlli di validità. */
export interface MappedRow {
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  budget: string | null;
  preferredZone: string | null;
}

export interface RowOutcome {
  /** Numero di riga nel file, intestazione esclusa: è ciò che l'utente vede. */
  line: number;
  row?: MappedRow;
  /** Motivo dello scarto, già scritto per l'utente. */
  error?: string;
}

function cell(values: string[], index: number | undefined): string {
  if (index === undefined) return "";
  return (values[index] ?? "").trim();
}

/**
 * Trasforma una riga del file in un lead, o spiega perché non si può.
 *
 * Le righe scartate non fermano l'importazione: su ottocento contatti ce ne
 * sono sempre alcuni senza telefono, e rifiutare tutto il file per colpa loro
 * costringerebbe l'agenzia a pulire il CSV a mano prima di riprovare.
 */
export function mapRow(
  values: string[],
  mapping: Record<number, ImportField>,
  line: number
): RowOutcome {
  const byField = new Map<ImportField, number>();
  for (const [index, field] of Object.entries(mapping)) {
    byField.set(field, Number(index));
  }

  const firstName = cell(values, byField.get("firstName"));
  const lastName = cell(values, byField.get("lastName"));
  const fullName = cell(values, byField.get("fullName"));

  // Nome e cognome separati hanno la precedenza sulla colonna unica: se il
  // file ha entrambe le forme, quella scomposta è la più affidabile.
  const name = [firstName, lastName].filter(Boolean).join(" ").trim() || fullName;

  const rawPhone = cell(values, byField.get("phone"));
  const phone = rawPhone ? normalizeImportedPhone(rawPhone) : null;

  if (!name) {
    return { line, error: "Manca il nome del contatto" };
  }

  if (!phone) {
    return {
      line,
      error: rawPhone ? `Numero non valido: "${rawPhone}"` : "Manca il numero di telefono",
    };
  }

  const email = cell(values, byField.get("email"));
  const budget = cell(values, byField.get("budget"));
  const zone = cell(values, byField.get("zone"));

  return {
    line,
    row: {
      clientName: name.slice(0, 120),
      clientPhone: phone,
      // Un'email malformata si ignora invece di scartare il contatto: il
      // telefono è ciò che serve al flusso, l'email è un di più.
      clientEmail: email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email.toLowerCase().slice(0, 200) : null,
      budget: budget ? budget.slice(0, 60) : null,
      preferredZone: zone ? zone.slice(0, 120) : null,
    },
  };
}

export interface ImportPreview {
  valid: MappedRow[];
  skipped: RowOutcome[];
  /** Righe scartate perché lo stesso numero compare più volte nel file. */
  duplicatesInFile: number;
}

/**
 * Interpreta tutte le righe e toglie i doppioni interni al file.
 *
 * Una rubrica esportata contiene quasi sempre lo stesso numero due volte —
 * "Mario Rossi" e "Rossi Mario". Tenerli entrambi creerebbe due schede per la
 * stessa persona già al primo caricamento.
 */
export function buildPreview(
  rows: string[][],
  mapping: Record<number, ImportField>
): ImportPreview {
  const valid: MappedRow[] = [];
  const skipped: RowOutcome[] = [];
  const seen = new Set<string>();
  let duplicatesInFile = 0;

  rows.forEach((values, index) => {
    const outcome = mapRow(values, mapping, index + 2); // +2: intestazione e base 1

    if (!outcome.row) {
      skipped.push(outcome);
      return;
    }

    if (seen.has(outcome.row.clientPhone)) {
      duplicatesInFile++;
      return;
    }

    seen.add(outcome.row.clientPhone);
    valid.push(outcome.row);
  });

  return { valid, skipped, duplicatesInFile };
}
