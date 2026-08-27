"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, CheckCircle2, Loader2, Trash2, Users } from "lucide-react";
import { UpgradeLimitModal } from "@/components/billing/upgrade-limit-modal";
import { AddToCalendar } from "@/components/calendar/add-to-calendar";
import { cn } from "@/lib/utils";

interface SlotView {
  id: string;
  agentName: string;
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

/** Raggruppa gli slot per giorno per la vista a lista. */
function groupByDay(slots: SlotView[]): [string, SlotView[]][] {
  const groups = new Map<string, SlotView[]>();

  for (const slot of slots) {
    const day = DATE_FORMAT.format(new Date(slot.startTime));
    groups.set(day, [...(groups.get(day) ?? []), slot]);
  }

  return [...groups.entries()];
}

export function SlotManager() {
  const [slots, setSlots] = useState<SlotView[]>([]);
  const [quota, setQuota] = useState<QuotaView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [filter, setFilter] = useState<"all" | "free" | "booked">("all");

  const [agentName, setAgentName] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/calendar/slots");
    if (!response.ok) return;
    const data: { slots: SlotView[]; quota: QuotaView } = await response.json();
    setSlots(data.slots);
    setQuota(data.quota);
  }, []);

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, [load]);

  async function handleCreate() {
    setIsSaving(true);
    setError(null);
    setConfirmation(null);

    try {
      const response = await fetch("/api/calendar/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName, date, startTime, endTime }),
      });

      if (response.status === 402) {
        setShowLimitModal(true);
        return;
      }

      const body = await response.json();

      if (!response.ok) {
        const issues = body.issues as Record<string, string[]> | undefined;
        const firstIssue = issues ? Object.values(issues).flat()[0] : undefined;
        setError(firstIssue ?? "Creazione slot non riuscita.");
        return;
      }

      setStartTime("");
      setEndTime("");
      setConfirmation("Disponibilità aggiunta: l'assistente può già proporla.");
      setTimeout(() => setConfirmation(null), 4000);
      await load();
    } catch {
      setError("Errore di rete durante il salvataggio.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(slotId: string) {
    const response = await fetch(`/api/calendar/slots/${slotId}`, { method: "DELETE" });
    if (response.ok) await load();
  }

  const canSubmit = agentName.trim().length >= 2 && date && startTime && endTime;
  const visibleSlots = slots.filter((slot) =>
    filter === "all" ? true : filter === "free" ? !slot.isBooked : slot.isBooked
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section id="nuova-disponibilita" className="scroll-mt-20 rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Nuova disponibilità</h2>
          {quota && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Agende attive: {quota.used}
              {quota.limit === null ? " (illimitate)" : ` / ${quota.limit}`}
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="agent-name" className="text-xs font-medium text-muted-foreground">
              Agente
            </label>
            <input
              id="agent-name"
              type="text"
              list="existing-agents"
              value={agentName}
              onChange={(event) => setAgentName(event.target.value)}
              placeholder="Marco Bianchi"
              className="mt-1 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-base text-foreground sm:text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/40"
            />
            <datalist id="existing-agents">
              {[...new Set(slots.map((slot) => slot.agentName))].map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <div>
            <label htmlFor="slot-date" className="text-xs font-medium text-muted-foreground">
              Data
            </label>
            <input
              id="slot-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-base text-foreground sm:text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/40"
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
              className="mt-1 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-base text-foreground sm:text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/40"
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
              className="mt-1 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-base text-foreground sm:text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-status-blocked">
            {error}
          </p>
        )}

        {confirmation && (
          <p
            role="status"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-status-qualified"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {confirmation}
          </p>
        )}

        {quota && !quota.canAddAgent && (
          <p className="mt-3 text-xs text-muted-foreground">
            Hai raggiunto il numero di agende del tuo piano. Puoi comunque aggiungere altri slot agli
            agenti esistenti.
          </p>
        )}

        <button
          type="button"
          onClick={handleCreate}
          disabled={!canSubmit || isSaving}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
          Aggiungi disponibilità
        </button>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
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
              Non hai ancora aperto nessuna disponibilità
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Indica le fasce in cui puoi far visitare gli immobili: l&apos;assistente le propone da
              solo agli acquirenti che ha qualificato e ti riporta l&apos;appuntamento già fissato.
              Finché non ce n&apos;è nessuna, la conversazione si ferma un passo prima.
            </p>
            {/* Riporta al modulo qui sopra e mette il cursore nel primo campo:
                un empty state che dice cosa fare senza portarcisi è mezzo
                inutile su uno schermo di telefono. */}
            <button
              type="button"
              onClick={() => {
                const form = document.getElementById("nuova-disponibilita");
                form?.scrollIntoView({ behavior: "smooth", block: "center" });
                form?.querySelector("input")?.focus({ preventScroll: true });
              }}
              className="btn-brand mx-auto mt-5"
            >
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              Apri la prima disponibilità
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {groupByDay(visibleSlots).map(([day, daySlots]) => (
              <div key={day}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {day}
                </h3>
                <ul className="mt-2 space-y-2">
                  {daySlots.map((slot) => (
                    <li
                      key={slot.id}
                      className="rounded-lg border border-border p-3"
                    >
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
                              onClick={() => handleDelete(slot.id)}
                              aria-label="Elimina slot"
                              className="inline-flex h-11 w-11 items-center justify-center sm:h-8 sm:w-8 rounded-lg border border-border text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-status-blocked"
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
            ))}
          </div>
        )}
      </section>

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
