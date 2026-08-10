"use client";

import { useState } from "react";
import { CalendarX2, CheckCircle2, Clock, Loader2, Plug, Send } from "lucide-react";
import type { LeadView } from "@/lib/whatsapp/view-types";
import { cn } from "@/lib/utils";

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

function formatMoment(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : DATE_TIME_FORMAT.format(date);
}

/**
 * Stato del promemoria anti no-show sull'appuntamento del lead.
 *
 * La disdetta è l'informazione più urgente di tutta la scheda: significa che
 * l'agente ha un buco in agenda proprio ora, e che quello slot è di nuovo
 * prenotabile da un altro cliente.
 */
function AppointmentStatus({ lead }: { lead: LeadView }) {
  if (lead.appointmentConfirmed === false) {
    return (
      <p className="flex items-start gap-1.5 text-sm text-status-blocked">
        <CalendarX2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Il cliente ha <span className="font-medium">disdetto</span> l&apos;appuntamento. Lo slot è
          stato liberato in agenda.
        </span>
      </p>
    );
  }

  if (lead.appointmentConfirmed === true) {
    return (
      <p className="flex items-start gap-1.5 text-sm text-status-qualified">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Presenza confermata dal cliente.</span>
      </p>
    );
  }

  if (lead.reminderSentAt) {
    return (
      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Promemoria inviato il {formatMoment(lead.reminderSentAt)}. In attesa di risposta.
        </span>
      </p>
    );
  }

  return (
    <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
      <Clock className="mt-0.5 h-4 w-4 shrink-0" />
      <span>Promemoria automatico non ancora inviato.</span>
    </p>
  );
}

/**
 * "Integrazione Gestionale" nella scheda del lead qualificato: consegna al
 * gestionale e stato del promemoria anti no-show.
 */
export function CrmExportCard({ lead }: { lead: LeadView }) {
  const [deliveredAt, setDeliveredAt] = useState(lead.crmDeliveredAt);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function send() {
    setIsSending(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/whatsapp/leads/${lead.id}/crm-export`, {
        method: "POST",
      });
      const body = await response.json();

      if (!response.ok) {
        setFeedback({
          tone: "error",
          text: body.message ?? "Invio non riuscito. Controlla il collegamento al gestionale in Impostazioni.",
        });
        return;
      }

      setDeliveredAt(body.crmDeliveredAt as string);
      setFeedback({ tone: "ok", text: "Lead inviato al gestionale." });
    } catch {
      setFeedback({ tone: "error", text: "Errore di rete durante l'invio." });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="rounded-lg border border-border p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Plug className="h-3.5 w-3.5" />
        Integrazione Gestionale
      </h3>

      {lead.appointmentSlot || lead.appointmentConfirmed !== null ? (
        <div className="mt-2">
          <AppointmentStatus lead={lead} />
        </div>
      ) : null}

      <p className="mt-2 text-sm text-muted-foreground">
        {deliveredAt
          ? `Ultimo invio al gestionale: ${formatMoment(deliveredAt)}.`
          : "Non ancora inviato al gestionale."}
      </p>

      <button
        type="button"
        onClick={send}
        disabled={isSending}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted disabled:opacity-50"
      >
        {isSending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
        {deliveredAt ? "Invia di nuovo al gestionale" : "Invia al gestionale"}
      </button>

      {feedback && (
        <p
          role="status"
          className={cn(
            "mt-2 text-xs",
            feedback.tone === "ok" ? "text-status-qualified" : "text-status-blocked"
          )}
        >
          {feedback.text}
        </p>
      )}
    </section>
  );
}
