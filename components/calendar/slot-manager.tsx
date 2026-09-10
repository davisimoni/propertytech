"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CalendarPlus, CalendarRange, CheckCircle2, Link2, Loader2, Trash2, Users } from "lucide-react";
import { UpgradeLimitModal } from "@/components/billing/upgrade-limit-modal";
import { AddToCalendar } from "@/components/calendar/add-to-calendar";
import { SlotBatchForm, type ModalitaBatch } from "@/components/calendar/slot-batch-form";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InfoTip } from "@/components/shared/info-tip";
import { Skeleton, SkeletonList } from "@/components/shared/skeleton";
import { useToast } from "@/components/shared/toast-provider";
import type { TimeRange } from "@/lib/calendar/batch-slots";
import { cn } from "@/lib/utils";

interface SlotView {
  id: string;
  agentName: string;
  assignedToId: string | null;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  bookedBy: { clientName: string; clientPhone: string; propertyRef: string } | null;
}

interface QuotaView {
  used: number;
  limit: number | null;
  canAddAgent: boolean;
}

interface MembroTeam {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  acceptedAt: string | null;
}

const TIME_FORMAT = new Intl.DateTimeFormat("it-IT", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

const DATE_FORMAT = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Rome",
});

/** Chiave `YYYY-MM-DD` del giorno di uno slot, in orario dell'agenzia. */
const DAY_KEY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Europe/Rome",
});

interface GruppoGiorno {
  chiave: string;
  etichetta: string;
  slots: SlotView[];
}

/**
 * Raggruppa per giorno di calendario dell'agenzia.
 *
 * La chiave è la data in `Europe/Rome`, non l'etichetta stampata: due giorni
 * diversi possono avere la stessa etichetta a distanza di un anno, e la
 * cancellazione in blocco lavora proprio su quella chiave.
 */
function groupByDay(slots: SlotView[]): GruppoGiorno[] {
  const groups = new Map<string, GruppoGiorno>();

  for (const slot of slots) {
    const quando = new Date(slot.startTime);
    const chiave = DAY_KEY_FORMAT.format(quando);
    const esistente = groups.get(chiave);

    if (esistente) esistente.slots.push(slot);
    else groups.set(chiave, { chiave, etichetta: DATE_FORMAT.format(quando), slots: [slot] });
  }

  return [...groups.values()];
}

function nomeMembro(membro: MembroTeam): string {
  const nome = [membro.firstName, membro.lastName].filter(Boolean).join(" ").trim();
  return nome || membro.email;
}

type Scheda = "singola" | "ricorrenza" | "multidata";

const SCHEDE: { id: Scheda; label: string; icona: typeof CalendarPlus }[] = [
  { id: "singola", label: "Singola", icona: CalendarPlus },
  { id: "ricorrenza", label: "Ricorrenza settimanale", icona: CalendarRange },
  { id: "multidata", label: "Più date", icona: CalendarDays },
];

export function SlotManager() {
  const { showToast } = useToast();

  const [slots, setSlots] = useState<SlotView[]>([]);
  const [quota, setQuota] = useState<QuotaView | null>(null);
  const [team, setTeam] = useState<MembroTeam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [filter, setFilter] = useState<"all" | "free" | "booked">("all");
  const [scheda, setScheda] = useState<Scheda>("singola");

  /*
   * L'agente come coppia nome + account.
   *
   * `agentName` è ciò che il cliente legge nel messaggio WhatsApp e resta una
   * stringa libera: un collaboratore senza account dell'agenzia deve poter
   * comunque avere un'agenda. `assignedToId` è l'account, e quando c'è
   * abilita le due cose che senza di lui non funzionano — l'incrocio col
   * calendario collegato e la scrittura della visita sull'agenda giusta.
   */
  const [agentName, setAgentName] = useState("");
  const [assignedToId, setAssignedToId] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [daEliminare, setDaEliminare] = useState<SlotView | null>(null);
  const [giornoDaSvuotare, setGiornoDaSvuotare] = useState<GruppoGiorno | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/calendar/slots");
    if (!response.ok) return;
    const data: { slots: SlotView[]; quota: QuotaView } = await response.json();
    setSlots(data.slots);
    setQuota(data.quota);
  }, []);

  const loadTeam = useCallback(async () => {
    // Accessorio: senza l'elenco resta il campo a testo libero, che è il
    // comportamento di sempre. Un errore qui non deve impedire di aprire slot.
    const response = await fetch("/api/team").catch(() => null);
    if (!response?.ok) return;
    const data: { members: MembroTeam[] } = await response.json();
    setTeam(data.members.filter((membro) => membro.acceptedAt !== null));
  }, []);

  useEffect(() => {
    Promise.all([load(), loadTeam()]).finally(() => setIsLoading(false));
  }, [load, loadTeam]);

  /** Sceglie un collaboratore dall'elenco, o torna al nome libero. */
  function scegliMembro(id: string) {
    if (!id) {
      setAssignedToId(null);
      return;
    }
    const membro = team.find((m) => m.id === id);
    if (!membro) return;
    setAssignedToId(membro.id);
    setAgentName(nomeMembro(membro));
  }

  /** Traduce in messaggio le risposte di errore comuni ai due percorsi. */
  async function gestisciErrore(response: Response): Promise<boolean> {
    if (response.status === 402) {
      setShowLimitModal(true);
      return true;
    }

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const issues = body?.issues as Record<string, string[]> | undefined;
      const primoProblema = issues ? Object.values(issues).flat()[0] : undefined;
      setError(primoProblema ?? body?.message ?? "Creazione non riuscita.");
      return true;
    }

    return false;
  }

  async function handleCreate() {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/calendar/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName, assignedToId, date, startTime, endTime }),
      });

      if (await gestisciErrore(response)) return;

      setStartTime("");
      setEndTime("");
      showToast("Disponibilità aggiunta: l'assistente può già proporla.", "success");
      await load();
    } catch {
      setError("Errore di rete durante il salvataggio.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleBatch(payload: {
    dates: string[];
    ranges: TimeRange[];
    slotMinutes: number | null;
  }) {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/calendar/slots/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName, assignedToId, ...payload }),
      });

      if (await gestisciErrore(response)) return;

      const esito: {
        created: number;
        saltatiSovrapposti: number;
        saltatiOccupati: number;
        saltatiPassati: number;
      } = await response.json();

      /*
       * Il messaggio dice anche cosa NON è stato creato.
       *
       * Chi chiede venti slot e ne vede comparire diciassette senza una
       * spiegazione conclude che il salvataggio abbia perso qualcosa. I
       * saltati hanno tre ragioni diverse e vanno nominate, perché su due di
       * esse l'agente può intervenire.
       */
      const saltati = [
        esito.saltatiSovrapposti > 0 ? `${esito.saltatiSovrapposti} già coperti` : null,
        esito.saltatiOccupati > 0 ? `${esito.saltatiOccupati} occupati in calendario` : null,
        esito.saltatiPassati > 0 ? `${esito.saltatiPassati} già passati` : null,
      ].filter(Boolean);

      const dettaglio = saltati.length > 0 ? ` (${saltati.join(", ")})` : "";

      if (esito.created === 0) {
        showToast(`Nessuna disponibilità aperta${dettaglio}.`, "info");
      } else {
        showToast(
          `${esito.created} ${esito.created === 1 ? "disponibilità aperta" : "disponibilità aperte"}${dettaglio}.`,
          "success"
        );
      }

      await load();
    } catch {
      setError("Errore di rete durante la creazione massiva.");
    } finally {
      setIsSaving(false);
    }
  }

  async function eliminaSlot(slot: SlotView) {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/calendar/slots/${slot.id}`, { method: "DELETE" });
      if (response.ok) {
        showToast("Disponibilità eliminata.", "success");
        await load();
      } else {
        showToast("Eliminazione non riuscita.", "error");
      }
    } finally {
      setIsSaving(false);
      setDaEliminare(null);
    }
  }

  async function svuotaGiorno(gruppo: GruppoGiorno) {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/calendar/slots?day=${gruppo.chiave}`, {
        method: "DELETE",
      });

      if (response.ok) {
        const { deleted }: { deleted: number } = await response.json();
        showToast(
          deleted === 1 ? "1 disponibilità eliminata." : `${deleted} disponibilità eliminate.`,
          "success"
        );
        await load();
      } else {
        showToast("Eliminazione non riuscita.", "error");
      }
    } finally {
      setIsSaving(false);
      setGiornoDaSvuotare(null);
    }
  }

  const agenteValido = agentName.trim().length >= 2;
  const canSubmit = agenteValido && date && startTime && endTime && !isSaving;
  const visibleSlots = slots.filter((slot) =>
    filter === "all" ? true : filter === "free" ? !slot.isBooked : slot.isBooked
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="card-surface p-4 md:p-5">
          <Skeleton className="h-5 w-44" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        </div>
        <div className="card-surface p-4 md:p-5">
          <Skeleton className="h-5 w-40" />
          <SkeletonList rows={3} className="mt-4" label="Caricamento delle disponibilità" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section
        id="nuova-disponibilita"
        className="card-surface scroll-mt-20 p-4 md:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            Nuova disponibilità
            <InfoTip label="Le fasce che apri qui sono quelle che l'assistente WhatsApp propone da solo ai lead qualificati per far visitare gli immobili. Finché non ce n'è nessuna, la conversazione si ferma un passo prima dell'appuntamento." />
          </h2>
          {quota && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Agende attive: {quota.used}
              {quota.limit === null ? " (illimitate)" : ` / ${quota.limit}`}
            </span>
          )}
        </div>

        {/* --- Agente: comune a tutte e tre le modalità --- */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="agent-member" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              Collaboratore
              <InfoTip label="Scegliendo una persona con un account, le sue disponibilità vengono incrociate con il calendario che ha collegato: non verranno proposti orari in cui è già occupata, e la visita finirà sulla sua agenda." />
            </label>
            <select
              id="agent-member"
              value={assignedToId ?? ""}
              onChange={(event) => scegliMembro(event.target.value)}
              className="input-field mt-1.5"
            >
              <option value="">Nessuno (agenda generica)</option>
              {team.map((membro) => (
                <option key={membro.id} value={membro.id}>
                  {nomeMembro(membro)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="agent-name" className="text-xs font-medium text-muted-foreground">
              Nome mostrato al cliente
            </label>
            <input
              id="agent-name"
              type="text"
              list="existing-agents"
              value={agentName}
              onChange={(event) => setAgentName(event.target.value)}
              placeholder="Marco Bianchi"
              className="input-field mt-1.5"
            />
            <datalist id="existing-agents">
              {[...new Set(slots.map((slot) => slot.agentName))].map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
        </div>

        {/* --- Selettore di modalità --- */}
        <div
          role="tablist"
          aria-label="Modalità di inserimento"
          className="mt-5 inline-flex flex-wrap rounded-lg border border-border p-0.5"
        >
          {SCHEDE.map((voce) => {
            const Icona = voce.icona;
            const attiva = scheda === voce.id;
            return (
              <button
                key={voce.id}
                type="button"
                role="tab"
                aria-selected={attiva}
                onClick={() => setScheda(voce.id)}
                className={cn(
                  "inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors duration-200 sm:h-9",
                  attiva
                    ? "bg-brand-gradient text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Icona className="h-3.5 w-3.5" />
                {voce.label}
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          {scheda === "singola" ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="slot-date" className="text-xs font-medium text-muted-foreground">
                    Data
                  </label>
                  <input
                    id="slot-date"
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="input-field mt-1.5"
                  />
                </div>

                <div>
                  <label htmlFor="slot-start" className="text-xs font-medium text-muted-foreground">
                    Ora inizio
                  </label>
                  <input
                    id="slot-start"
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    className="input-field mt-1.5"
                  />
                </div>

                <div>
                  <label htmlFor="slot-end" className="text-xs font-medium text-muted-foreground">
                    Ora fine
                  </label>
                  <input
                    id="slot-end"
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    className="input-field mt-1.5"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreate}
                disabled={!canSubmit}
                className="btn-brand w-full sm:w-auto disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CalendarPlus className="h-4 w-4" />
                )}
                Aggiungi disponibilità
              </button>
            </div>
          ) : (
            <SlotBatchForm
              // Rimonta cambiando modalità: le date scelte a mano non devono
              // sopravvivere al passaggio alla ricorrenza, dove non hanno più
              // alcun significato.
              key={scheda}
              modalita={scheda as ModalitaBatch}
              isSaving={isSaving}
              onSubmit={handleBatch}
            />
          )}
        </div>

        {!agenteValido && (
          <p className="mt-3 text-xs text-muted-foreground">
            Indica un collaboratore o scrivi il nome che il cliente leggerà nel messaggio.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-status-blocked">
            {error}
          </p>
        )}

        {quota && !quota.canAddAgent && (
          <p className="mt-3 text-xs text-muted-foreground">
            Hai raggiunto il numero di agende del tuo piano. Puoi comunque aggiungere altri slot agli
            agenti esistenti.
          </p>
        )}
      </section>

      <section className="card-surface p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Disponibilità inserite</h2>
          <div className="flex gap-2">
            {(
              [
                { value: "all", label: "Tutti" },
                { value: "free", label: "Liberi" },
                { value: "booked", label: "Prenotati" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                aria-pressed={filter === option.value}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200",
                  filter === option.value
                    ? "bg-brand-gradient text-white shadow-sm"
                    : "border border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {visibleSlots.length === 0 ? (
          <div className="py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-sm">
              <CalendarPlus className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="mt-4 text-sm font-semibold text-foreground">
              {filter === "all"
                ? "Non hai ancora aperto nessuna disponibilità"
                : filter === "free"
                  ? "Nessuna disponibilità libera"
                  : "Nessun appuntamento prenotato"}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {filter === "all"
                ? "Indica le fasce in cui puoi far visitare gli immobili: l'assistente le propone da solo agli acquirenti che ha qualificato e ti riporta l'appuntamento già fissato. Finché non ce n'è nessuna, la conversazione si ferma un passo prima."
                : filter === "free"
                  ? "Tutte le fasce inserite sono già state prenotate. Apri altre disponibilità per continuare a ricevere appuntamenti."
                  : "Quando l'assistente fissa una visita, l'appuntamento compare qui con il nome del cliente e l'immobile."}
            </p>
            {filter === "all" && (
              /* Riporta al modulo qui sopra e mette il cursore nel primo campo:
                 un empty state che dice cosa fare senza portarcisi è mezzo
                 inutile su uno schermo di telefono. */
              <button
                type="button"
                onClick={() => {
                  const form = document.getElementById("nuova-disponibilita");
                  form?.scrollIntoView({ behavior: "smooth", block: "center" });
                  form?.querySelector("select")?.focus({ preventScroll: true });
                }}
                className="btn-brand mx-auto mt-5"
              >
                <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                Apri la prima disponibilità
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {groupByDay(visibleSlots).map((gruppo) => {
              const liberiNelGiorno = gruppo.slots.filter((slot) => !slot.isBooked).length;

              return (
                <div key={gruppo.chiave}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {gruppo.etichetta}
                    </h3>
                    {/* Solo da due slot liberi in su: sotto, il pulsante per
                        riga fa già lo stesso lavoro senza una conferma in più. */}
                    {liberiNelGiorno > 1 && (
                      <button
                        type="button"
                        onClick={() => setGiornoDaSvuotare(gruppo)}
                        className="text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-status-blocked hover:underline"
                      >
                        Svuota il giorno ({liberiNelGiorno})
                      </button>
                    )}
                  </div>

                  <ul className="mt-2 space-y-2">
                    {gruppo.slots.map((slot) => (
                      <li key={slot.id} className="rounded-lg border border-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {TIME_FORMAT.format(new Date(slot.startTime))} –{" "}
                              {TIME_FORMAT.format(new Date(slot.endTime))}
                              <span className="ml-2 font-normal text-muted-foreground">
                                {slot.agentName}
                              </span>
                            </p>
                            {slot.bookedBy && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                Visita con {slot.bookedBy.clientName} · {slot.bookedBy.propertyRef}
                              </p>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            {/* Dice che questa fascia è incrociata con un
                                calendario vero: è la differenza fra un orario
                                proposto alla cieca e uno verificato. */}
                            {slot.assignedToId && (
                              <span
                                title="Incrociata con il calendario collegato di questo collaboratore"
                                className="hidden items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground sm:inline-flex"
                              >
                                <Link2 className="h-3 w-3" />
                                Agenda collegata
                              </span>
                            )}

                            {slot.isBooked ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-status-qualified/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Prenotato
                              </span>
                            ) : (
                              <>
                                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                  Libero
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setDaEliminare(slot)}
                                  aria-label="Elimina slot"
                                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-status-blocked sm:h-8 sm:w-8"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {slot.bookedBy && (
                          <AddToCalendar
                            clientName={slot.bookedBy.clientName}
                            clientPhone={slot.bookedBy.clientPhone}
                            propertyRef={slot.bookedBy.propertyRef}
                            agentName={slot.agentName}
                            startISO={slot.startTime}
                            endISO={slot.endTime}
                            className="mt-3"
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {daEliminare && (
        <ConfirmDialog
          title="Eliminare questa disponibilità?"
          description={`${TIME_FORMAT.format(new Date(daEliminare.startTime))} – ${TIME_FORMAT.format(new Date(daEliminare.endTime))} con ${daEliminare.agentName}. L'assistente smetterà di proporre questo orario.`}
          confirmLabel="Elimina"
          isWorking={isSaving}
          onConfirm={() => void eliminaSlot(daEliminare)}
          onCancel={() => setDaEliminare(null)}
        />
      )}

      {giornoDaSvuotare && (
        <ConfirmDialog
          title={`Svuotare ${giornoDaSvuotare.etichetta}?`}
          description={`Vengono eliminate le disponibilità ancora libere di quel giorno. Gli appuntamenti già prenotati restano: quelli si disdicono dalla scheda del cliente, non da qui.`}
          confirmLabel="Svuota il giorno"
          isWorking={isSaving}
          onConfirm={() => void svuotaGiorno(giornoDaSvuotare)}
          onCancel={() => setGiornoDaSvuotare(null)}
        />
      )}

      {showLimitModal && (
        <UpgradeLimitModal
          feature="agendas"
          reason="not_in_plan"
          onNavigateAway={() => setShowLimitModal(false)}
        />
      )}
    </div>
  );
}
