"use client";

import { CalendarPlus, Download } from "lucide-react";
import {
  buildGoogleCalendarUrl,
  buildICalendar,
  icsFileName,
  type AppointmentDetails,
} from "@/lib/calendar-export";
import { cn } from "@/lib/utils";

interface AddToCalendarProps {
  clientName: string;
  clientPhone: string;
  propertyRef: string;
  agentName?: string | null;
  /** Istante di inizio in formato ISO. */
  startISO: string;
  /** Istante di fine in formato ISO; se assente si assume un'ora. */
  endISO?: string | null;
  className?: string;
}

const DATE_LABEL = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

/**
 * Aggiunge la visita al calendario dell'agente.
 *
 * Il file .ics è costruito e scaricato nel browser: contiene solo dati già
 * visibili nella pagina, quindi un giro sul server aggiungerebbe latenza
 * senza portare nulla.
 */
export function AddToCalendar({
  clientName,
  clientPhone,
  propertyRef,
  agentName,
  startISO,
  endISO,
  className,
}: AddToCalendarProps) {
  const start = new Date(startISO);
  if (Number.isNaN(start.getTime())) return null;

  const parsedEnd = endISO ? new Date(endISO) : null;
  const appointment: AppointmentDetails = {
    clientName,
    clientPhone,
    propertyRef,
    agentName,
    start,
    end: parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : start,
  };

  function downloadIcs() {
    const blob = new Blob([buildICalendar(appointment)], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = icsFileName(appointment);
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div className={cn("rounded-lg border border-border bg-muted/30 p-3", className)}>
      <p className="text-xs font-medium text-foreground">
        Visita fissata: {DATE_LABEL.format(start)}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <a
          href={buildGoogleCalendarUrl(appointment)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          Aggiungi a Google Calendar
        </a>

        <button
          type="button"
          onClick={downloadIcs}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" />
          Scarica .ics (Apple / Outlook)
        </button>
      </div>
    </div>
  );
}
