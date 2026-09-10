"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, Loader2, Plus, X } from "lucide-react";
import {
  MAX_SLOTS_PER_BATCH,
  SLOT_DURATIONS,
  WEEKDAYS,
  datesForWeekdays,
  fasceSovrapposte,
  generateSlots,
  type TimeRange,
} from "@/lib/calendar/batch-slots";
import { InfoTip } from "@/components/shared/info-tip";
import { cn } from "@/lib/utils";

/**
 * Il modulo condiviso da "Ricorrenza settimanale" e "Più date".
 *
 * Le due modalità differiscono per una cosa sola — da dove escono le date — e
 * quindi qui dentro cambia solo il selettore in alto. Fasce orarie, durata,
 * anteprima e pulsante sono gli stessi oggetti: duplicarli avrebbe voluto dire
 * correggere due volte ogni ritocco al conteggio o alla validazione.
 */

export type ModalitaBatch = "ricorrenza" | "multidata";

const OGGI = new Date().toISOString().slice(0, 10);

/** Fasce di partenza: la mattina tipo di un'agenzia, già compilata. */
const FASCE_INIZIALI: TimeRange[] = [{ start: "09:00", end: "12:00" }];

export function SlotBatchForm({
  modalita,
  isSaving,
  onSubmit,
}: {
  modalita: ModalitaBatch;
  isSaving: boolean;
  onSubmit: (payload: {
    dates: string[];
    ranges: TimeRange[];
    slotMinutes: number | null;
  }) => void;
}) {
  // --- Ricorrenza: giorni della settimana + periodo ---
  const [giorni, setGiorni] = useState<number[]>([1, 2, 3, 4, 5]);
  const [dal, setDal] = useState(OGGI);
  const [al, setAl] = useState("");

  // --- Multi-data: date scelte una per una ---
  const [dateScelte, setDateScelte] = useState<string[]>([]);
  const [dataDaAggiungere, setDataDaAggiungere] = useState("");

  // --- Comuni alle due modalità ---
  const [fasce, setFasce] = useState<TimeRange[]>(FASCE_INIZIALI);
  const [durata, setDurata] = useState<number | null>(null);

  const date = useMemo(
    () =>
      modalita === "ricorrenza"
        ? al
          ? datesForWeekdays(dal, al, giorni)
          : []
        : [...dateScelte].sort(),
    [modalita, dal, al, giorni, dateScelte]
  );

  const sovrapposte = fasceSovrapposte(fasce);

  /*
   * L'anteprima usa lo stesso generatore del server.
   *
   * Non è un conto approssimato fatto qui: è la funzione che poi scriverà le
   * righe, quindi il numero mostrato è quello che si otterrà davvero — resto
   * della divisione compreso, che a occhio nessuno calcola.
   */
  const anteprima = useMemo(
    () => generateSlots({ dates: date, ranges: fasce, slotMinutes: durata }),
    [date, fasce, durata]
  );

  const totale = anteprima.slots.length;
  const puoGenerare = totale > 0 && !sovrapposte && !isSaving;

  function aggiornaFascia(indice: number, campo: keyof TimeRange, valore: string) {
    setFasce((correnti) =>
      correnti.map((fascia, i) => (i === indice ? { ...fascia, [campo]: valore } : fascia))
    );
  }

  function aggiungiData() {
    if (!dataDaAggiungere) return;
    setDateScelte((correnti) =>
      correnti.includes(dataDaAggiungere) ? correnti : [...correnti, dataDaAggiungere]
    );
    setDataDaAggiungere("");
  }

  return (
    <div className="space-y-5">
      {modalita === "ricorrenza" ? (
        <>
          <fieldset>
            <legend className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              Giorni della settimana
              <InfoTip label="Le disponibilità vengono aperte in questi giorni, per ogni settimana del periodo indicato sotto." />
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAYS.map((giorno) => {
                const attivo = giorni.includes(giorno.value);
                return (
                  <button
                    key={giorno.value}
                    type="button"
                    onClick={() =>
                      setGiorni((correnti) =>
                        attivo
                          ? correnti.filter((v) => v !== giorno.value)
                          : [...correnti, giorno.value]
                      )
                    }
                    aria-pressed={attivo}
                    aria-label={giorno.long}
                    className={cn(
                      "h-11 min-w-[3.25rem] rounded-lg px-3 text-xs font-medium transition-all duration-200 sm:h-9",
                      attivo
                        ? "bg-brand-gradient text-white shadow-sm"
                        : "border border-border-strong text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {giorno.short}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="batch-dal" className="text-xs font-medium text-muted-foreground">
                Dal
              </label>
              <input
                id="batch-dal"
                type="date"
                value={dal}
                min={OGGI}
                onChange={(event) => setDal(event.target.value)}
                className="input-field mt-1.5"
              />
            </div>
            <div>
              <label htmlFor="batch-al" className="text-xs font-medium text-muted-foreground">
                Al
              </label>
              <input
                id="batch-al"
                type="date"
                value={al}
                min={dal || OGGI}
                onChange={(event) => setAl(event.target.value)}
                className="input-field mt-1.5"
              />
            </div>
          </div>
        </>
      ) : (
        <div>
          <label htmlFor="batch-data" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            Date scelte
            <InfoTip label="Aggiungi una data per volta: le stesse fasce orarie verranno aperte su tutte le date in elenco." />
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input
              id="batch-data"
              type="date"
              value={dataDaAggiungere}
              min={OGGI}
              onChange={(event) => setDataDaAggiungere(event.target.value)}
              className="input-field max-w-[12rem]"
            />
            <button
              type="button"
              onClick={aggiungiData}
              disabled={!dataDaAggiungere}
              className="btn-outline text-xs disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Aggiungi data
            </button>
          </div>

          {dateScelte.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {[...dateScelte].sort().map((data) => (
                <li key={data}>
                  <button
                    type="button"
                    onClick={() => setDateScelte((correnti) => correnti.filter((d) => d !== data))}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-strong px-3 text-xs text-foreground transition-colors hover:border-status-blocked/40 hover:text-status-blocked"
                  >
                    {new Intl.DateTimeFormat("it-IT", {
                      day: "numeric",
                      month: "short",
                      timeZone: "Europe/Rome",
                    }).format(new Date(`${data}T12:00:00Z`))}
                    <X className="h-3 w-3" aria-hidden="true" />
                    <span className="sr-only">Togli questa data</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* --- Fasce orarie, comuni alle due modalità --- */}
      <fieldset>
        <legend className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          Fasce orarie
          <InfoTip label="Puoi aprire più fasce nello stesso giorno, per esempio mattina e pomeriggio. Vengono applicate identiche a ogni data." />
        </legend>

        <div className="mt-2 space-y-2">
          {fasce.map((fascia, indice) => (
            <div key={indice} className="flex flex-wrap items-center gap-2">
              <input
                type="time"
                value={fascia.start}
                onChange={(event) => aggiornaFascia(indice, "start", event.target.value)}
                aria-label={`Ora di inizio della fascia ${indice + 1}`}
                className="input-field max-w-[8rem]"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <input
                type="time"
                value={fascia.end}
                onChange={(event) => aggiornaFascia(indice, "end", event.target.value)}
                aria-label={`Ora di fine della fascia ${indice + 1}`}
                className="input-field max-w-[8rem]"
              />
              {fasce.length > 1 && (
                <button
                  type="button"
                  onClick={() => setFasce((correnti) => correnti.filter((_, i) => i !== indice))}
                  aria-label={`Togli la fascia ${indice + 1}`}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-status-blocked sm:h-9 sm:w-9"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {fasce.length < 6 && (
          <button
            type="button"
            onClick={() => setFasce((correnti) => [...correnti, { start: "15:00", end: "18:00" }])}
            className="btn-outline mt-2 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Aggiungi fascia
          </button>
        )}

        {sovrapposte && (
          <p role="alert" className="mt-2 text-xs text-status-blocked">
            Due fasce si accavallano nello stesso giorno: correggile, o l&apos;assistente
            proporrebbe lo stesso orario a due clienti diversi.
          </p>
        )}
      </fieldset>

      {/* --- Durata del singolo appuntamento --- */}
      <div>
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          Durata di ogni visita
          <InfoTip label="La fascia viene divisa in appuntamenti di questa durata. Lasciando 'fascia intera' resta un unico slot lungo, che l'assistente propone così com'è." />
        </span>
        <div className="mt-2 flex flex-wrap gap-2">
          {[null, ...SLOT_DURATIONS].map((valore) => {
            const attivo = durata === valore;
            return (
              <button
                key={valore ?? "intera"}
                type="button"
                onClick={() => setDurata(valore)}
                aria-pressed={attivo}
                className={cn(
                  "h-11 rounded-lg px-3 text-xs font-medium transition-all duration-200 sm:h-9",
                  attivo
                    ? "bg-brand-gradient text-white shadow-sm"
                    : "border border-border-strong text-muted-foreground hover:bg-muted"
                )}
              >
                {valore === null ? "Fascia intera" : `${valore} min`}
              </button>
            );
          })}
        </div>
      </div>

      {/* --- Anteprima: quante righe si stanno per creare --- */}
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        {totale > 0 ? (
          <p className="text-sm text-foreground">
            Verranno aperte{" "}
            <span className="font-semibold">
              {totale} {totale === 1 ? "disponibilità" : "disponibilità"}
            </span>{" "}
            su {date.length} {date.length === 1 ? "giorno" : "giorni"}.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {anteprima.problema === "troppi_slot"
              ? `Sono più di ${MAX_SLOTS_PER_BATCH} slot in una volta sola: restringi il periodo o allunga la durata delle visite.`
              : anteprima.problema === "fascia_non_valida"
                ? "Controlla le fasce orarie: l'ora di fine deve essere successiva a quella di inizio."
                : modalita === "ricorrenza"
                  ? "Scegli i giorni della settimana e il periodo per vedere quante disponibilità verranno create."
                  : "Aggiungi almeno una data per vedere quante disponibilità verranno create."}
          </p>
        )}

        {totale > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Gli orari già occupati — da un&apos;altra disponibilità o da un impegno sul calendario
            collegato dell&apos;agente — vengono saltati.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onSubmit({ dates: date, ranges: fasce, slotMinutes: durata })}
        disabled={!puoGenerare}
        className="btn-brand w-full sm:w-auto disabled:opacity-50"
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CalendarPlus className="h-4 w-4" />
        )}
        {isSaving ? "Creazione in corso…" : "Genera disponibilità"}
      </button>
    </div>
  );
}
