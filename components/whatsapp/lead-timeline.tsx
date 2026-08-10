"use client";

import { useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Bell,
  BotMessageSquare,
  CalendarCheck,
  CircleDot,
  Inbox,
  MessageSquare,
} from "lucide-react";
import {
  buildLeadTimeline,
  TIMELINE_COLLAPSED_COUNT,
  type TimelineKind,
} from "@/lib/history/lead-timeline";
import type { LeadView } from "@/lib/whatsapp/view-types";
import { cn } from "@/lib/utils";

/**
 * Storico delle interazioni su un lead.
 *
 * Riunisce in un'unica sequenza ciò che oggi è sparso fra la conversazione e i
 * campi della scheda: quando è arrivata la notizia, cosa si sono detti, quando
 * è stato fissato l'appuntamento, se il promemoria è partito e se il contatto
 * ha disdetto.
 */

const ICONS: Record<TimelineKind, typeof MessageSquare> = {
  created: Inbox,
  message_in: MessageSquare,
  message_out: BotMessageSquare,
  appointment: CalendarCheck,
  reminder: Bell,
  cancelled: CircleDot,
  crm: ArrowRightLeft,
  status: CircleDot,
};

const ACCENT: Record<TimelineKind, string> = {
  created: "text-muted-foreground",
  message_in: "text-foreground",
  message_out: "text-primary",
  appointment: "text-status-qualified",
  reminder: "text-status-pending",
  cancelled: "text-status-blocked",
  crm: "text-primary",
  status: "text-muted-foreground",
};

const FORMAT = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function LeadTimeline({ lead }: { lead: LeadView }) {
  const [expanded, setExpanded] = useState(false);

  const events = useMemo(() => buildLeadTimeline(lead, lead.messages), [lead]);
  const visible = expanded ? events : events.slice(0, TIMELINE_COLLAPSED_COUNT);

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Storico interazioni
      </h3>

      <ol className="mt-3 space-y-3">
        {visible.map((event, index) => {
          const Icon = ICONS[event.kind];

          return (
            <li key={`${event.kind}-${event.at ?? index}`} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted",
                    ACCENT[event.kind]
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                {/* Filo di collegamento, tranne sull'ultima voce. */}
                {index < visible.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
              </div>

              <div className="min-w-0 flex-1 pb-1">
                <p className="text-sm font-medium text-foreground">{event.title}</p>
                {event.detail && (
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">{event.detail}</p>
                )}
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {event.at ? FORMAT.format(new Date(event.at)) : "Data non disponibile"}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {events.length > TIMELINE_COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-2 text-xs font-medium text-primary hover:underline"
        >
          {expanded
            ? "Mostra meno"
            : `Mostra tutte le ${events.length} voci`}
        </button>
      )}
    </div>
  );
}
