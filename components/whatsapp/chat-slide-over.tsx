"use client";

import { useEffect } from "react";
import { Ban, CalendarClock, CheckCircle2, HelpCircle, Wallet, X, XCircle } from "lucide-react";
import { AddToCalendar } from "@/components/calendar/add-to-calendar";
import { PORTAL_SOURCE_LABELS, QUALIFICATION_STATUS_LABELS } from "@/lib/whatsapp/types";
import { STATUS_BADGE_CLASSES, type LeadView } from "@/lib/whatsapp/view-types";
import { PortfolioCard } from "./portfolio-card";
import { LeadPreferencesCard } from "./lead-preferences-card";
import { LeadAssignment } from "./lead-assignment";
import { LeadTimeline } from "@/components/whatsapp/lead-timeline";
import { DocumentVault } from "@/components/documents/document-vault";
import { CrmExportCard } from "./crm-export-card";
import { cn } from "@/lib/utils";

function TriStateRow({ label, value }: { label: string; value: boolean | null }) {
  const Icon = value === null ? HelpCircle : value ? CheckCircle2 : XCircle;
  const tone =
    value === null ? "text-muted-foreground" : value ? "text-status-qualified" : "text-status-blocked";
  const text = value === null ? "Non ancora emerso" : value ? "Sì" : "No";

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", tone)}>
        <Icon className="h-4 w-4" />
        {text}
      </span>
    </div>
  );
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

interface ChatSlideOverProps {
  lead: LeadView;
  onClose: () => void;
  /** Risalita della modifica manuale del portafoglio, per riallineare la lista. */
  onPortfolioUpdated: (ownedPropertiesCount: number | null) => void;
  /** Risalita della validazione di un match visura ↔ lead. */
  onMatchResolved: (matchId: string, ownedPropertiesCount: number | null) => void;
  /** Risalita dell'assegnazione a un collaboratore. */
  onAssigned: (assignedToId: string | null, assignedToName: string | null) => void;
}

export function ChatSlideOver({
  lead,
  onClose,
  onPortfolioUpdated,
  onMatchResolved,
  onAssigned,
}: ChatSlideOverProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Conversazione con ${lead.clientName}`}
        className="relative flex w-full max-w-lg flex-col bg-card shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">{lead.clientName}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {lead.clientPhone} · {PORTAL_SOURCE_LABELS[lead.portalSource]}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{lead.propertyRef}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium",
                STATUS_BADGE_CLASSES[lead.qualificationStatus]
              )}
            >
              {QUALIFICATION_STATUS_LABELS[lead.qualificationStatus]}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi dettaglio conversazione"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {lead.appointmentSlot && (
          <div className="border-b border-border p-4">
            <AddToCalendar
              clientName={lead.clientName}
              clientPhone={lead.clientPhone}
              propertyRef={lead.propertyRef}
              startISO={lead.appointmentSlot}
            />
          </div>
        )}

        <div className="border-b border-border p-4">
          <PortfolioCard
            lead={lead}
            onUpdated={onPortfolioUpdated}
            onMatchResolved={onMatchResolved}
          />
        </div>

        <div className="border-b border-border p-4">
          <LeadAssignment lead={lead} onAssigned={onAssigned} />
        </div>

        <div className="border-b border-border p-4">
          <LeadPreferencesCard lead={lead} />
        </div>

        <div className="border-b border-border p-4">
          <DocumentVault scope="lead" scopeId={lead.id} scopeLabel={lead.clientName} />
        </div>

        {/* Sezione riservata ai lead qualificati: è ciò che va nel gestionale. */}
        {lead.qualificationStatus === "QUALIFIED" && (
          <div className="border-b border-border p-4">
            <CrmExportCard lead={lead} />
          </div>
        )}

        <div className="border-b border-border p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Scheda di qualificazione
          </h3>
          <div className="mt-2 divide-y divide-border">
            <TriStateRow label="Mutuo deliberato / liquidità" value={lead.mortgageApproved} />
            <TriStateRow label="Deve vendere prima un immobile" value={lead.mustSellFirst} />
            <div className="flex items-center justify-between gap-3 py-2">
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
                Tempistica
              </span>
              <span className="text-sm font-medium text-foreground">
                {lead.timeframe ?? "Non ancora emersa"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 py-2">
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Wallet className="h-4 w-4" />
                Budget
              </span>
              <span className="text-sm font-medium text-foreground">
                {lead.budget ?? "Non dichiarato"}
              </span>
            </div>
          </div>
        </div>

        <div className="border-b border-border p-4">
          <LeadTimeline lead={lead} />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Conversazione WhatsApp
          </h3>

          {lead.qualificationStatus === "OPT_OUT" && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-status-blocked/30 bg-status-blocked/10 p-3 text-xs text-status-blocked">
              <Ban className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Il contatto ha revocato il consenso. Ogni invio automatico verso questo numero è
                bloccato in via permanente.
              </span>
            </div>
          )}

          {lead.messages.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              La conversazione non è ancora partita: appena WhatsApp è collegato e ci sono crediti
              disponibili, l&apos;assistente scrive per primo e comincia a qualificare il contatto.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {lead.messages.map((message, index) => (
                <div
                  key={index}
                  className={cn("flex", message.sender === "bot" ? "justify-start" : "justify-end")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2",
                      message.sender === "bot"
                        ? "bg-muted text-foreground"
                        : "bg-brand-gradient text-white"
                    )}
                  >
                    <p className="whitespace-pre-wrap text-sm">{message.text}</p>
                    <p
                      className={cn(
                        "mt-1 text-[10px]",
                        message.sender === "bot" ? "text-muted-foreground" : "text-primary-foreground/70"
                      )}
                    >
                      {message.sender === "bot" ? "Assistente AI" : lead.clientName} ·{" "}
                      {formatTime(message.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
