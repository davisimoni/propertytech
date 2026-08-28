"use client";

import { useCallback, useEffect, useState } from "react";
import type { QualificationStatus } from "@prisma/client";
import type { DealStage } from "@prisma/client";
import {
  ArrowDownWideNarrow,
  CalendarX2,
  Columns3,
  Crown,
  Eye,
  Home,
  Loader2,
  RefreshCw,
  ShieldQuestion,
  Table2,
  Users,
  Upload,
  FlaskConical,
} from "lucide-react";
import { LeadKanban } from "./lead-kanban";
import { PORTAL_SOURCE_LABELS, QUALIFICATION_STATUS_LABELS } from "@/lib/whatsapp/types";
import { STATUS_BADGE_CLASSES, type LeadView } from "@/lib/whatsapp/view-types";
import {
  deriveSellerCategory,
  isGoldLead,
  portfolioBadgeLabel,
  SELLER_CATEGORY_LABELS,
} from "@/lib/whatsapp/portfolio";
import { ChatSlideOver } from "./chat-slide-over";
import { cn } from "@/lib/utils";

type Filter = "ALL" | QualificationStatus;

const FILTERS: { value: Filter; label: string; dot?: string }[] = [
  { value: "ALL", label: "Tutti" },
  { value: "QUALIFIED", label: "Qualificati", dot: "bg-status-qualified" },
  { value: "IN_PROGRESS", label: "In corso", dot: "bg-status-pending" },
  { value: "UNQUALIFIED", label: "Non qualificati", dot: "bg-status-blocked" },
  { value: "PENDING", label: "In attesa", dot: "bg-muted-foreground" },
];

/** Polling a 15s: la pipeline deve riflettere le conversazioni in tempo reale. */
const REFRESH_INTERVAL_MS = 15_000;

/**
 * Badge compatto del portafoglio, accanto al nome del contatto.
 * Serve a riconoscere un multi-proprietario scorrendo la lista, senza aprire
 * la scheda: è l'informazione che decide chi chiamare per primo.
 */
function PortfolioBadge({ count }: { count: number | null }) {
  const label = portfolioBadgeLabel(count);
  if (!label) return null;

  const category = deriveSellerCategory(count);
  const gold = isGoldLead(count);
  const description = category ? SELLER_CATEGORY_LABELS[category] : "";

  return (
    <span
      title={`${description} · ${label.replace("x", "")} immobili rilevati`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
        gold ? "bg-status-pending/15 text-status-pending" : "bg-primary/10 text-primary"
      )}
    >
      {gold ? <Crown className="h-3 w-3" /> : <Home className="h-3 w-3" />}
      {label}
      <span className="sr-only">{description}</span>
    </span>
  );
}

interface LeadPipelineProps {
  /** Apre l'importatore rubrica, che vive nel modulo sopra la pipeline. */
  onImportRequested: () => void;
  /** Porta alla scheda "Testa l'AI". */
  onTryAssistant: () => void;
}

export function LeadPipeline({ onImportRequested, onTryAssistant }: LeadPipelineProps) {
  const [leads, setLeads] = useState<LeadView[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [sortByPortfolio, setSortByPortfolio] = useState(false);
  const [view, setView] = useState<"table" | "kanban">("table");
  const [isLoading, setIsLoading] = useState(true);
  /**
   * Errore dell'ultimo caricamento.
   *
   * Distinto dall'elenco vuoto: una tabella che dice "nessun lead" perche' la
   * richiesta e' fallita fa credere all'agenzia di aver perso i contatti, ed
   * e' il momento in cui smette di fidarsi dello strumento.
   */
  const [loadError, setLoadError] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadView | null>(null);

  const fetchLeads = useCallback(async (status: Filter, byPortfolio: boolean) => {
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    if (byPortfolio) params.set("sort", "portfolio");

    const query = params.toString();

    try {
      const response = await fetch(`/api/whatsapp/leads${query ? `?${query}` : ""}`);
      if (!response.ok) throw new Error();
      const data: { leads: LeadView[] } = await response.json();
      setLeads(data.leads);
      setLoadError(false);

      // Tiene allineato il cassetto aperto: stato, budget e zona possono
      // cambiare mentre l'agente lo sta guardando. La cronologia no, quella
      // se la carica il cassetto per conto suo.
      setSelectedLead((current) =>
        current ? data.leads.find((lead) => lead.id === current.id) ?? current : null
      );
    } catch {
      // Un giro di polling fallito su una lista gia' caricata non cancella
      // nulla a schermo: si segnala e si riprova al giro dopo.
      setLoadError(true);
      return;
    }
  }, []);

  /**
   * Applica subito una modifica manuale del portafoglio, senza aspettare il
   * polling: l'agente che corregge il dato durante la telefonata deve vederlo
   * cambiare mentre parla.
   */
  const applyPortfolioUpdate = useCallback(
    (leadId: string, ownedPropertiesCount: number | null) => {
      const patch = {
        ownedPropertiesCount,
        sellerCategory: deriveSellerCategory(ownedPropertiesCount),
      };

      setLeads((current) =>
        current.map((lead) => (lead.id === leadId ? { ...lead, ...patch } : lead))
      );
      setSelectedLead((current) => (current?.id === leadId ? { ...current, ...patch } : current));
    },
    []
  );

  /** Toglie il match appena deciso dalla lista e allinea il conteggio. */
  const applyMatchResolution = useCallback(
    (leadId: string, matchId: string, ownedPropertiesCount: number | null) => {
      const patch = (lead: LeadView): LeadView => ({
        ...lead,
        ownedPropertiesCount,
        sellerCategory: deriveSellerCategory(ownedPropertiesCount),
        pendingMatches: lead.pendingMatches.filter((match) => match.id !== matchId),
      });

      setLeads((current) => current.map((lead) => (lead.id === leadId ? patch(lead) : lead)));
      setSelectedLead((current) => (current?.id === leadId ? patch(current) : current));
    },
    []
  );

  /** Toglie il lead dalla lista e chiude il cassetto dopo la cancellazione. */
  const applyDeletion = useCallback((leadId: string) => {
    setLeads((current) => current.filter((lead) => lead.id !== leadId));
    setSelectedLead(null);
  }, []);

  /**
   * Apre direttamente la scheda indicata da `?lead=` nell'indirizzo.
   *
   * E' il link che parte nell'avviso di lead caldo: chi lo riceve sul telefono
   * deve trovarsi davanti quella conversazione, non una lista in cui cercare
   * il nome. Scatta una volta sola — `openedFromUrl` — altrimenti ogni giro di
   * polling riaprirebbe il cassetto sopra a quello che l'agente sta guardando.
   */
  const [openedFromUrl, setOpenedFromUrl] = useState(false);
  useEffect(() => {
    if (openedFromUrl || leads.length === 0) return;

    const wanted = new URLSearchParams(window.location.search).get("lead");
    if (!wanted) {
      setOpenedFromUrl(true);
      return;
    }

    const target = leads.find((lead) => lead.id === wanted);
    if (target) setSelectedLead(target);
    setOpenedFromUrl(true);
  }, [leads, openedFromUrl]);

  /** Riflette subito la presa in carico umana. */
  const applyAiEnabled = useCallback((leadId: string, aiEnabled: boolean) => {
    setLeads((current) =>
      current.map((lead) => (lead.id === leadId ? { ...lead, aiEnabled } : lead))
    );
    setSelectedLead((current) => (current?.id === leadId ? { ...current, aiEnabled } : current));
  }, []);

  /** Sposta un lead di colonna nello stato locale, senza attendere il polling. */
  const applyStageChange = useCallback((leadId: string, dealStage: DealStage) => {
    setLeads((current) =>
      current.map((lead) => (lead.id === leadId ? { ...lead, dealStage } : lead))
    );
    setSelectedLead((current) => (current?.id === leadId ? { ...current, dealStage } : current));
  }, []);

  /** Riflette subito l'assegnazione, senza attendere il polling. */
  const applyAssignment = useCallback(
    (leadId: string, assignedToId: string | null, assignedToName: string | null) => {
      const patch = { assignedToId, assignedToName };
      setLeads((current) => current.map((l) => (l.id === leadId ? { ...l, ...patch } : l)));
      setSelectedLead((current) => (current?.id === leadId ? { ...current, ...patch } : current));
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      await fetchLeads(filter, sortByPortfolio);
      if (!cancelled) setIsLoading(false);
    }

    load();
    const interval = setInterval(() => fetchLeads(filter, sortByPortfolio), REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [filter, sortByPortfolio, fetchLeads]);

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          Pipeline Lead &amp; Qualificazione in Tempo Reale
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Selettore di vista: tabella per lavorare sui dettagli,
              board per riordinare la pipeline a colpo d'occhio. */}
          <div role="tablist" aria-label="Vista dei lead" className="flex rounded-lg border border-border p-0.5">
            {(
              [
                ["table", "Tabella", Table2],
                ["kanban", "Pipeline", Columns3],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-200",
                  view === id
                    ? "bg-brand-gradient text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSortByPortfolio((value) => !value)}
            aria-pressed={sortByPortfolio}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200",
              sortByPortfolio
                ? "bg-status-pending/15 text-status-pending"
                : "border border-border text-muted-foreground hover:border-primary/40 hover:bg-muted"
            )}
          >
            <ArrowDownWideNarrow className="h-3.5 w-3.5" />
            Prima i multi-proprietari
          </button>
          <button
            type="button"
            onClick={() => fetchLeads(filter, sortByPortfolio)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Aggiorna
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            aria-pressed={filter === item.value}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200",
              filter === item.value
                ? "bg-brand-gradient text-white shadow-sm"
                : "border border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {item.dot && <span className={cn("h-1.5 w-1.5 rounded-full", item.dot)} aria-hidden="true" />}
            {item.label}
          </button>
        ))}
      </div>

      {loadError ? (
        <p className="mb-3 rounded-lg border border-status-blocked/30 bg-status-blocked/10 px-3 py-2 text-xs text-status-blocked">
          Aggiornamento non riuscito: quello che vedi potrebbe non essere aggiornato. Riprovo fra
          poco.
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : leads.length === 0 ? (
        <div className="py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-sm">
            <Users className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="mt-4 text-sm font-semibold text-foreground">
            Non è ancora arrivata nessuna notizia
          </p>
          {/* Niente "URL webhook" né "endpoint": all'agente interessa che i
              portali gli mandino i contatti, non come tecnicamente accade. */}
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Appena Immobiliare.it o Idealista ti girano una richiesta, il contatto compare qui già
            ingaggiato su WhatsApp. Puoi anche partire dai contatti che hai già in rubrica.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={onImportRequested} className="btn-brand">
              <Upload className="h-4 w-4" aria-hidden="true" />
              Importa la tua rubrica
            </button>
            <button type="button" onClick={onTryAssistant} className="btn-outline">
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              Prova l&apos;assistente
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            La prova non consuma crediti e non scrive a nessuno.
          </p>
        </div>
      ) : view === "kanban" ? (
        <LeadKanban leads={leads} onOpenLead={setSelectedLead} onStageChanged={applyStageChange} />
      ) : (
          <>
          {/* Tabella solo da tablet in su: a 720px minimi su un telefono
              da 390 servirebbero due schermate di scorrimento laterale. */}
          <div className="mt-4 hidden overflow-x-auto rounded-lg border border-border md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Nome Cliente</th>
                <th className="px-3 py-2 font-medium">Telefono</th>
                <th className="px-3 py-2 font-medium">Fonte</th>
                <th className="px-3 py-2 font-medium">Immobile</th>
                <th className="px-3 py-2 font-medium">Stato</th>
                <th className="px-3 py-2 text-right font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className={cn(
                    "border-b border-border last:border-0 hover:bg-muted/30",
                    // Il Lead Oro resta riconoscibile anche quando la lista non
                    // è ordinata per portafoglio.
                    isGoldLead(lead.ownedPropertiesCount) &&
                      "bg-status-pending/[0.06] hover:bg-status-pending/10"
                  )}
                >
                  <td className="px-3 py-2 font-medium text-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{lead.clientName}</span>
                      <PortfolioBadge count={lead.ownedPropertiesCount} />
                      {lead.pendingMatches.length > 0 && (
                        <span
                          title="Corrispondenza da visura da verificare"
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-status-pending/15 px-1.5 py-0.5 text-[11px] font-semibold text-status-pending"
                        >
                          <ShieldQuestion className="h-3 w-3" />
                          Da verificare
                        </span>
                      )}
                      {lead.appointmentConfirmed === false && (
                        <span
                          title="Il cliente ha disdetto l'appuntamento"
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-status-blocked/10 px-1.5 py-0.5 text-[11px] font-semibold text-status-blocked"
                        >
                          <CalendarX2 className="h-3 w-3" />
                          Disdetta
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{lead.clientPhone}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {PORTAL_SOURCE_LABELS[lead.portalSource]}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-muted-foreground">
                    {lead.propertyRef}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-block rounded-full px-2.5 py-1 text-xs font-medium",
                        STATUS_BADGE_CLASSES[lead.qualificationStatus]
                      )}
                    >
                      {QUALIFICATION_STATUS_LABELS[lead.qualificationStatus]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedLead(lead)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Dettaglio chat
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

          {/* Stessa informazione, impilata: su mobile una scheda per contatto
              si legge con il pollice, una tabella no. */}
          <ul className="mt-4 space-y-2 md:hidden">
            {leads.map((lead) => (
              <li key={lead.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-foreground">
                      {lead.clientName}
                    </span>
                    <PortfolioBadge count={lead.ownedPropertiesCount} />
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      STATUS_BADGE_CLASSES[lead.qualificationStatus]
                    )}
                  >
                    {QUALIFICATION_STATUS_LABELS[lead.qualificationStatus]}
                  </span>
                </div>

                <p className="mt-1 truncate text-xs text-muted-foreground">{lead.propertyRef}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {lead.clientPhone} · {PORTAL_SOURCE_LABELS[lead.portalSource]}
                </p>

                {lead.appointmentConfirmed === false && (
                  <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-status-blocked">
                    <CalendarX2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Ha disdetto la visita
                  </p>
                )}

                {lead.pendingMatches.length > 0 && (
                  <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-status-pending">
                    <ShieldQuestion className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {lead.pendingMatches.length} da verificare
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedLead(lead)}
                  className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  Apri la scheda
                </button>
              </li>
            ))}
          </ul>
          </>
      )}

      {selectedLead && (
        <ChatSlideOver
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onPortfolioUpdated={(count) => applyPortfolioUpdate(selectedLead.id, count)}
          onMatchResolved={(matchId, count) =>
            applyMatchResolution(selectedLead.id, matchId, count)
          }
          onAssigned={(assignedToId, assignedToName) =>
            applyAssignment(selectedLead.id, assignedToId, assignedToName)
          }
          onDeleted={() => applyDeletion(selectedLead.id)}
          onAiEnabledChange={(aiEnabled) => applyAiEnabled(selectedLead.id, aiEnabled)}
        />
      )}
    </section>
  );
}
