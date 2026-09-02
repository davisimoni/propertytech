"use client";

import { useEffect, useState } from "react";
import {
  Ban,
  CalendarClock,
  CheckCircle2,
  HelpCircle,
  Loader2,
  MessageSquare,
  Trash2,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { AddToCalendar } from "@/components/calendar/add-to-calendar";
import { PORTAL_SOURCE_LABELS, QUALIFICATION_STATUS_LABELS } from "@/lib/whatsapp/types";
import { STATUS_BADGE_CLASSES, type LeadView } from "@/lib/whatsapp/view-types";
import type { ChatMessage } from "@/lib/whatsapp/types";
import { PortfolioCard } from "./portfolio-card";
import { LeadPreferencesCard } from "./lead-preferences-card";
import { LeadMatchesCard } from "./lead-matches-card";
import { LeadAssignment } from "./lead-assignment";
import { LeadNotesCard } from "./lead-notes-card";
import { LeadTimeline } from "@/components/whatsapp/lead-timeline";
import { DocumentVault } from "@/components/documents/document-vault";
import { CrmExportCard } from "./crm-export-card";
import { AiHandoverToggle } from "./ai-handover-toggle";
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
  /** Risalita della cancellazione: la lista toglie la riga e il cassetto si chiude. */
  onDeleted: () => void;
  /** Risalita della presa in carico umana. */
  onAiEnabledChange: (aiEnabled: boolean) => void;
}

export function ChatSlideOver({
  lead,
  onClose,
  onPortfolioUpdated,
  onMatchResolved,
  onAssigned,
  onDeleted,
  onAiEnabledChange,
}: ChatSlideOverProps) {
  /**
   * La cronologia si carica all'apertura, non arriva con la lista.
   *
   * La lista si ricarica da sola ogni 15 secondi e portarsi dietro le
   * trascrizioni di cento conversazioni a ogni giro significava trasferire
   * megabyte per mostrare una tabella di nomi e stati.
   */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [messagesError, setMessagesError] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let annullato = false;
    setIsLoadingMessages(true);
    setMessagesError(false);

    fetch(`/api/whatsapp/leads/${lead.id}/messages`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((data: { messages: ChatMessage[] }) => {
        if (!annullato) setMessages(data.messages);
      })
      .catch(() => {
        // Errore dichiarato invece di una chat vuota: un cassetto che mostra
        // "la conversazione non e' ancora partita" quando la richiesta e'
        // fallita fa credere all'agente che il cliente non abbia mai scritto.
        if (!annullato) setMessagesError(true);
      })
      .finally(() => {
        if (!annullato) setIsLoadingMessages(false);
      });

    return () => {
      annullato = true;
    };
  }, [lead.id]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Escape chiude prima la conferma, poi il cassetto: annullare per errore
      // una cancellazione è innocuo, chiudere il cassetto mentre si sta
      // decidendo se cancellare fa ricominciare da capo.
      if (confirmingDelete) setConfirmingDelete(false);
      else onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, confirmingDelete]);

  async function deleteLead() {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/whatsapp/leads/${lead.id}?confirm=true`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error();
      onDeleted();
    } catch {
      setDeleteError("Eliminazione non riuscita. Riprova.");
      setIsDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex h-[100dvh] justify-end">
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
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg transition-all duration-200 hover:bg-muted sm:h-8 sm:w-8"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/*
          Un solo contenitore che scorre.
          Prima ogni scheda era un figlio a altezza fissa del flex verticale e
          solo la conversazione era `flex-1`: le schede consumavano tutta
          l'altezza del cassetto e la conversazione restava schiacciata a pochi
          pixel in fondo. Non mancava: era invisibile.
        */}
        <div className="flex-1 overflow-y-auto">
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

          {/*
            La conversazione per prima: il pulsante che apre questo pannello si
            chiama "Dettaglio chat", e chi lo preme sta cercando cosa si sono
            detti — non il fascicolo documentale.
          */}
          <div className="border-b border-border p-4">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              Conversazione WhatsApp
            </h3>

            {/* Sopra le bolle: e' l'informazione che decide se l'agente puo'
                scrivere lui senza che l'assistente gli risponda sopra. */}
            <div className="mt-3">
              <AiHandoverToggle
                leadId={lead.id}
                aiEnabled={lead.aiEnabled}
                onChange={onAiEnabledChange}
              />
            </div>

            {lead.qualificationStatus === "OPT_OUT" && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-status-blocked/30 bg-status-blocked/10 p-3 text-xs text-status-blocked">
                <Ban className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Il contatto ha revocato il consenso. Ogni invio automatico verso questo numero è
                  bloccato in via permanente.
                </span>
              </div>
            )}

            {isLoadingMessages ? (
              <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carico la conversazione…
              </p>
            ) : messagesError ? (
              <p className="mt-4 text-sm text-status-blocked">
                Non è stato possibile caricare la conversazione. Chiudi e riapri il dettaglio.
              </p>
            ) : messages.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                La conversazione non è ancora partita: appena WhatsApp è collegato e ci sono crediti
                disponibili, l&apos;assistente scrive per primo e comincia a qualificare il contatto.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {messages.map((message, index) => (
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
                          message.sender === "bot"
                            ? "text-muted-foreground"
                            : "text-primary-foreground/70"
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

          {/* Subito sotto la chat: è ciò che l'AI ha ricavato da quei messaggi. */}
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

          {/* Subito dopo le preferenze: sono i criteri da cui questi
              abbinamenti nascono, e leggerli di seguito ha senso. */}
          <div className="border-b border-border p-4">
            <LeadPreferencesCard lead={lead} />
          </div>

          <div className="border-b border-border p-4">
            <LeadMatchesCard leadId={lead.id} clientName={lead.clientName} />
          </div>

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

          {/* Subito sotto l'assegnazione: chi prende in carico un contatto
              legge nell'ordine chi lo segue e cosa si sono detti finora. */}
          <div className="border-b border-border p-4">
            <LeadNotesCard leadId={lead.id} />
          </div>

          <div className="border-b border-border p-4">
            <LeadTimeline lead={{ ...lead, messages }} />
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

          {/* Ultima, e senza risalto: è l'unica azione da cui non si torna. */}
          <div className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Zona pericolosa
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Elimina la scheda e l&apos;intera conversazione. I documenti caricati nel fascicolo
              restano in archivio, perché l&apos;agenzia è tenuta a conservarli.
            </p>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={isDeleting}
              className="mt-3 inline-flex h-11 items-center gap-1.5 rounded-lg border border-status-blocked/40 px-3 text-xs font-medium text-status-blocked transition-all duration-200 hover:bg-status-blocked/10 disabled:opacity-50 sm:h-9"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Elimina lead
            </button>
            {deleteError ? <p className="mt-2 text-xs text-status-blocked">{deleteError}</p> : null}
          </div>
        </div>
      </div>

      {confirmingDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setConfirmingDelete(false)}
            aria-hidden="true"
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="conferma-eliminazione"
            className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl"
          >
            <h2 id="conferma-eliminazione" className="text-sm font-semibold text-foreground">
              Eliminare {lead.clientName}?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              La scheda e tutti i messaggi scambiati vengono cancellati definitivamente. Non è
              possibile annullare.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {/*
                Il fuoco iniziale sta su Annulla, non su Elimina: il primo tasto
                premuto a caso non deve cancellare una conversazione.
              */}
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmingDelete(false)}
                disabled={isDeleting}
                className="btn-outline text-xs disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={deleteLead}
                disabled={isDeleting}
                className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-status-blocked px-3 text-xs font-medium text-white transition-all duration-200 hover:opacity-90 disabled:opacity-50 sm:h-9"
              >
                {isDeleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Elimina definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
