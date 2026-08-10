"use client";

import { useMemo, useState, type DragEvent } from "react";
import type { DealStage } from "@prisma/client";
import { Eye, GripVertical, Loader2, UserCog } from "lucide-react";
import {
  DEAL_STAGE_ACCENT,
  DEAL_STAGE_LABELS,
  DEAL_STAGES,
  isDealStage,
} from "@/lib/leads/deal-stage";
import { isGoldLead, portfolioBadgeLabel } from "@/lib/whatsapp/portfolio";
import { PORTAL_SOURCE_LABELS } from "@/lib/whatsapp/types";
import type { LeadView } from "@/lib/whatsapp/view-types";
import { cn } from "@/lib/utils";

interface LeadKanbanProps {
  leads: LeadView[];
  onOpenLead: (lead: LeadView) => void;
  /** Applica lo spostamento nello stato del chiamante, che è la fonte di verità. */
  onStageChanged: (leadId: string, stage: DealStage) => void;
}

/**
 * Board Kanban della pipeline trattative.
 *
 * Lo spostamento è possibile sia trascinando la scheda sia dal selettore in
 * calce: il drag and drop non funziona sui touch screen senza una libreria
 * dedicata, e metà degli agenti lavora dallo smartphone (CLAUDE.md §1). Il
 * selettore è quindi la strada principale, non un ripiego per
 * l'accessibilità.
 */
export function LeadKanban({ leads, onOpenLead, onStageChanged }: LeadKanbanProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<DealStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const grouped = new Map<DealStage, LeadView[]>(DEAL_STAGES.map((stage) => [stage, []]));
    for (const lead of leads) {
      grouped.get(lead.dealStage)?.push(lead);
    }
    return grouped;
  }, [leads]);

  async function move(lead: LeadView, stage: DealStage) {
    if (stage === lead.dealStage) return;

    setPendingId(lead.id);
    setError(null);

    // Ottimistico: la scheda si sposta subito, perché l'agente sta riordinando
    // la pipeline e un ritardo di rete a ogni trascinamento la renderebbe
    // inutilizzabile. In caso di errore si torna indietro.
    onStageChanged(lead.id, stage);

    try {
      const response = await fetch(`/api/whatsapp/leads/${lead.id}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealStage: stage }),
      });

      if (!response.ok) {
        onStageChanged(lead.id, lead.dealStage);
        setError("Spostamento non riuscito. La scheda è tornata al suo posto.");
      }
    } catch {
      onStageChanged(lead.id, lead.dealStage);
      setError("Errore di rete: la scheda è tornata al suo posto.");
    } finally {
      setPendingId(null);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, stage: DealStage) {
    event.preventDefault();
    setDragOverStage(null);

    const leadId = event.dataTransfer.getData("text/plain");
    const lead = leads.find((item) => item.id === leadId);
    if (lead) void move(lead, stage);
  }

  // Nessun contenitore proprio: la board vive dentro la card della pipeline,
  // che porta già bordo, sfondo e spaziatura.
  return (
    <div>
      <p className="mt-4 text-xs text-muted-foreground">
        Trascina una scheda da una colonna all&apos;altra, oppure cambia fase dal selettore.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm text-status-blocked">
          {error}
        </p>
      )}

      {/* Scorrimento orizzontale confinato alla board: la pagina non deve
          mai scorrere in orizzontale (CLAUDE.md §6). */}
      <div className="mt-4 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {DEAL_STAGES.map((stage) => {
            const columnLeads = byStage.get(stage) ?? [];

            return (
              <div
                key={stage}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverStage(stage);
                }}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={(event) => handleDrop(event, stage)}
                className={cn(
                  "flex w-64 shrink-0 flex-col rounded-lg border p-2.5 transition-colors duration-200",
                  dragOverStage === stage
                    ? "border-primary bg-primary/5"
                    : "border-border bg-muted/30"
                )}
              >
                <div className="flex items-center gap-2 px-1 pb-2">
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full", DEAL_STAGE_ACCENT[stage])}
                    aria-hidden="true"
                  />
                  <h3 className="text-xs font-semibold text-foreground">
                    {DEAL_STAGE_LABELS[stage]}
                  </h3>
                  <span className="ml-auto rounded-full bg-card px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {columnLeads.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {columnLeads.length === 0 ? (
                    <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                      Trascina qui una scheda
                    </p>
                  ) : (
                    columnLeads.map((lead) => {
                      const badge = portfolioBadgeLabel(lead.ownedPropertiesCount);

                      return (
                        <article
                          key={lead.id}
                          draggable
                          onDragStart={(event) => event.dataTransfer.setData("text/plain", lead.id)}
                          className={cn(
                            "rounded-lg border border-border bg-card p-2.5 shadow-sm transition-all duration-200",
                            pendingId === lead.id && "opacity-60",
                            isGoldLead(lead.ownedPropertiesCount) && "border-status-pending/40"
                          )}
                        >
                          <div className="flex items-start gap-1.5">
                            <GripVertical
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground"
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">
                                {lead.clientName}
                              </p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {PORTAL_SOURCE_LABELS[lead.portalSource]}
                              </p>
                            </div>
                            {badge && (
                              <span className="shrink-0 rounded-full bg-status-pending/15 px-1.5 py-0.5 text-[11px] font-semibold text-status-pending">
                                {badge}
                              </span>
                            )}
                          </div>

                          <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                            {lead.propertyRef}
                          </p>

                          {/* Chi segue il contatto: su una board condivisa fra
                              più agenti è l'informazione che evita due
                              telefonate allo stesso cliente. */}
                          {lead.assignedToName && (
                            <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                              <UserCog className="h-3 w-3 shrink-0" aria-hidden="true" />
                              {lead.assignedToName}
                            </p>
                          )}

                          <div className="mt-2 flex items-center gap-1.5">
                            <label className="sr-only" htmlFor={`stage-${lead.id}`}>
                              Fase di {lead.clientName}
                            </label>
                            <select
                              id={`stage-${lead.id}`}
                              value={lead.dealStage}
                              disabled={pendingId === lead.id}
                              onChange={(event) => {
                                const next = event.target.value;
                                if (isDealStage(next)) void move(lead, next);
                              }}
                              className="min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 py-1 text-[11px] text-foreground outline-none transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                            >
                              {DEAL_STAGES.map((option) => (
                                <option key={option} value={option}>
                                  {DEAL_STAGE_LABELS[option]}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              onClick={() => onOpenLead(lead)}
                              aria-label={`Apri la scheda di ${lead.clientName}`}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-all duration-200 hover:bg-muted"
                            >
                              {pendingId === lead.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
