/**
 * Generazione massiva di disponibilità: ricorrenza settimanale e multi-data.
 *
 * Modulo puro e client-safe (niente `server-only`, niente Prisma): le stesse
 * regole servono al browser, che mostra quanti slot verranno creati PRIMA di
 * premere, e al server, che li scrive. Se la generazione vivesse solo di là,
 * l'anteprima sarebbe una seconda implementazione destinata a divergere — e a
 * divergere sarebbe proprio il numero su cui l'agente decide se confermare.
 *
 * # Perché restituisce etichette e non istanti
 *
 * Perché un'agenzia ragiona in orario da parete: "il martedì dalle 9 alle 12"
 * resta 9-12 anche la settimana in cui cambia l'ora legale. Qui si compone il
 * calendario in `YYYY-MM-DD` + `HH:MM`; la conversione in istante UTC la fa
 * `toRomeInstant` lato server, una etichetta per volta, che è l'unico punto in
 * cui il fuso entra in gioco.
 *
 * # Perché ricorrenza e multi-data sono la stessa funzione
 *
 * Perché lo sono davvero: entrambe producono un insieme di date, e su ogni
 * data applicano le stesse fasce. Cambia solo da dove arrivano le date — da
 * un intervallo filtrato per giorno della settimana, oppure da una scelta
 * esplicita sul calendario. Due generatori paralleli avrebbero significato due
 * copie della stessa aritmetica sugli orari, e un giorno una sola delle due
 * corretta.
 */

/** Una fascia oraria in orario locale dell'agenzia, come la scrive l'agente. */
export interface TimeRange {
  /** `HH:MM` */
  start: string;
  /** `HH:MM` */
  end: string;
}

/** Uno slot generato, ancora in etichette locali. */
export interface GeneratedSlot {
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:MM` */
  start: string;
  /** `HH:MM` */
  end: string;
}

/**
 * Tetto ai record creati in una sola operazione.
 *
 * Non è una regola di piano ma una protezione: "tutti i giorni per un anno,
 * ogni mezz'ora" sono migliaia di righe, quasi sempre un errore di
 * impostazione che ci si accorge di aver fatto solo dopo. Meglio un rifiuto
 * con un numero in chiaro che un'agenda da ripulire a mano.
 */
export const MAX_SLOTS_PER_BATCH = 400;

/** Ampiezza massima del periodo di ricorrenza, in giorni. */
export const MAX_RANGE_DAYS = 180;

/** Durate proposte per lo spezzettamento di una fascia. */
export const SLOT_DURATIONS = [30, 45, 60, 90, 120] as const;

export type SlotDuration = (typeof SLOT_DURATIONS)[number];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

/** `HH:MM` -> minuti dalla mezzanotte. */
export function minutesFromMidnight(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** Minuti dalla mezzanotte -> `HH:MM`, con lo zero davanti. */
export function timeFromMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Le date di un intervallo che cadono nei giorni della settimana scelti.
 *
 * `weekdays` usa la convenzione di `Date`: 0 domenica, 1 lunedì … 6 sabato.
 * L'aritmetica è tutta in UTC a mezzogiorno: sommare 24 ore a una mezzanotte
 * locale salta o ripete un giorno nelle due notti in cui cambia l'ora legale,
 * e l'errore si vedrebbe come un martedì mancante a fine ottobre.
 */
export function datesForWeekdays(from: string, to: string, weekdays: number[]): string[] {
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) return [];
  if (weekdays.length === 0) return [];

  const cursor = new Date(`${from}T12:00:00Z`);
  const last = new Date(`${to}T12:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return [];
  if (cursor > last) return [];

  const wanted = new Set(weekdays);
  const dates: string[] = [];

  // Il tetto sui giorni è anche la garanzia che questo ciclo finisca: un
  // intervallo malformato non deve poter girare all'infinito nel browser.
  for (let i = 0; i <= MAX_RANGE_DAYS && cursor <= last; i++) {
    if (wanted.has(cursor.getUTCDay())) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

/**
 * Spezza una fascia in slot della durata indicata.
 *
 * Il resto NON diventa uno slot più corto: da 09:00-12:00 con slot da 45
 * minuti escono quattro slot fino alle 12:00 e restano 0 minuti; da
 * 09:00-11:00 con slot da 45 escono due slot e i 30 minuti finali si perdono.
 * È voluto — una visita da 30 minuti dove ne servono 45 è un appuntamento che
 * sfora sul successivo, e l'agente lo scopre in macchina.
 *
 * Senza durata la fascia resta una sola, così com'è stata scritta.
 */
export function splitRange(range: TimeRange, slotMinutes: number | null): TimeRange[] {
  const start = minutesFromMidnight(range.start);
  const end = minutesFromMidnight(range.end);
  if (end <= start) return [];

  if (!slotMinutes || slotMinutes <= 0) return [{ start: range.start, end: range.end }];

  const slots: TimeRange[] = [];
  for (let cursor = start; cursor + slotMinutes <= end; cursor += slotMinutes) {
    slots.push({
      start: timeFromMinutes(cursor),
      end: timeFromMinutes(cursor + slotMinutes),
    });
  }

  return slots;
}

export interface BatchSpec {
  /** Date già risolte, in `YYYY-MM-DD`. */
  dates: string[];
  /** Fasce da applicare a ciascuna data. */
  ranges: TimeRange[];
  /** Durata del singolo appuntamento; `null` lascia la fascia intera. */
  slotMinutes?: number | null;
}

export interface BatchGenerationResult {
  slots: GeneratedSlot[];
  /** Motivo per cui non è stato generato nulla, o per cui il risultato è tagliato. */
  problema:
    | null
    | "nessuna_data"
    | "nessuna_fascia"
    | "fascia_non_valida"
    | "troppi_slot";
}

/**
 * Compone date × fasce, con le fasce già spezzate per durata.
 *
 * Ordina il risultato: le righe arrivano al database in ordine cronologico, e
 * un'anteprima che elenca gli orari a caso sembra rotta anche quando è giusta.
 */
export function generateSlots(spec: BatchSpec): BatchGenerationResult {
  const dates = [...new Set(spec.dates)].filter((d) => DATE_PATTERN.test(d)).sort();
  if (dates.length === 0) return { slots: [], problema: "nessuna_data" };

  const ranges = spec.ranges.filter((r) => TIME_PATTERN.test(r.start) && TIME_PATTERN.test(r.end));
  if (ranges.length === 0) return { slots: [], problema: "nessuna_fascia" };

  if (ranges.some((r) => minutesFromMidnight(r.end) <= minutesFromMidnight(r.start))) {
    return { slots: [], problema: "fascia_non_valida" };
  }

  const perDay = ranges.flatMap((range) => splitRange(range, spec.slotMinutes ?? null));
  if (perDay.length === 0) return { slots: [], problema: "fascia_non_valida" };

  const totale = dates.length * perDay.length;
  if (totale > MAX_SLOTS_PER_BATCH) return { slots: [], problema: "troppi_slot" };

  const slots: GeneratedSlot[] = [];
  for (const date of dates) {
    for (const fascia of perDay) {
      slots.push({ date, start: fascia.start, end: fascia.end });
    }
  }

  slots.sort((a, b) =>
    a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)
  );

  return { slots, problema: null };
}

/**
 * Fasce che si sovrappongono fra loro nello stesso giorno.
 *
 * Serve a fermare l'errore prima della generazione: due fasce 09:00-12:00 e
 * 11:00-13:00 sullo stesso giorno producono slot che si accavallano, e
 * l'assistente proporrebbe due volte lo stesso orario a due clienti diversi.
 * Il confronto è stretto su entrambi i lati, come `confliggeCon`: due fasce
 * consecutive che si toccano alle 12:00 non sono in conflitto.
 */
export function fasceSovrapposte(ranges: TimeRange[]): boolean {
  const ordinate = [...ranges]
    .filter((r) => TIME_PATTERN.test(r.start) && TIME_PATTERN.test(r.end))
    .sort((a, b) => minutesFromMidnight(a.start) - minutesFromMidnight(b.start));

  for (let i = 1; i < ordinate.length; i++) {
    const precedente = ordinate[i - 1];
    const corrente = ordinate[i];
    if (!precedente || !corrente) continue;
    if (minutesFromMidnight(corrente.start) < minutesFromMidnight(precedente.end)) return true;
  }

  return false;
}

/** Etichette dei giorni, nell'ordine in cui si leggono in Italia (lunedì per primo). */
export const WEEKDAYS: { value: number; short: string; long: string }[] = [
  { value: 1, short: "Lun", long: "lunedì" },
  { value: 2, short: "Mar", long: "martedì" },
  { value: 3, short: "Mer", long: "mercoledì" },
  { value: 4, short: "Gio", long: "giovedì" },
  { value: 5, short: "Ven", long: "venerdì" },
  { value: 6, short: "Sab", long: "sabato" },
  { value: 0, short: "Dom", long: "domenica" },
];
