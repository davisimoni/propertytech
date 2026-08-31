"use client";

import { useCallback, useEffect, useState } from "react";
import { Gavel, Loader2, Plus, TrendingDown } from "lucide-react";
import { PROPERTY_TYPE_LABELS } from "@/lib/listings/property-fields";
import { RISK_CLASSES, RISK_LABELS, OCCUPANCY_LABELS } from "@/lib/radar/risk";
import { AI_DISCLAIMER } from "@/lib/compliance";
import { cn } from "@/lib/utils";
import type { AppraisalStatus, OccupancyStatus, PropertyType, RiskLevel } from "@prisma/client";
import { RadarPropertyForm } from "./radar-property-form";
import { AppraisalPanel } from "./appraisal-panel";

export interface RadarItem {
  id: string;
  kind: "ASTA" | "RIBASSO";
  comune: string;
  zona: string | null;
  type: PropertyType;
  priceEur: number;
  squareMeters: number;
  basePriceEur: number | null;
  previousPriceEur: number | null;
  auctionDate: string | null;
  lotto: string | null;
  sourceUrl: string | null;
  notes: string | null;
  appraisal: {
    status: AppraisalStatus;
    risk: RiskLevel;
    riskReasons: string[];
    occupancy: OccupancyStatus;
    failureReason: string | null;
  } | null;
  _count: { matches: number };
}

/** Ricontrollo mentre almeno una perizia è in analisi. */
const POLL_MS = 5_000;

const euro = (v: number) => new Intl.NumberFormat("it-IT").format(v);

function scontoPercentuale(item: RadarItem): number | null {
  const riferimento = item.kind === "ASTA" ? item.basePriceEur : item.previousPriceEur;
  if (!riferimento || riferimento <= item.priceEur) return null;
  return Math.round(((riferimento - item.priceEur) / riferimento) * 100);
}

export function RadarBoard() {
  const [items, setItems] = useState<RadarItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/radar/properties");
      if (!response.ok) throw new Error();
      const data: { items: RadarItem[] } = await response.json();
      setItems(data.items);
      setError(null);
    } catch {
      setError("Non è stato possibile caricare le opportunità.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * Si ricontrolla solo finché c'è qualcosa in analisi.
   *
   * L'analisi di una perizia è asincrona: la scheda nasce "in analisi" e si
   * completa da sola. Un polling costante costerebbe una richiesta ogni
   * cinque secondi anche a schermo fermo, quindi si accende quando serve e si
   * spegne quando tutte le perizie hanno un esito.
   */
  const inAnalisi = items.some((item) => item.appraisal?.status === "IN_ANALISI");

  useEffect(() => {
    if (!inAnalisi) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [inAnalisi, load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {items.length === 0
            ? "Nessuna opportunità in elenco."
            : `${items.length} opportunità · ${items.filter((i) => i.kind === "ASTA").length} aste`}
          {inAnalisi && (
            <span className="ml-2 inline-flex items-center gap-1 text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              perizia in analisi
            </span>
          )}
        </p>

        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-gradient px-3 text-xs font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110"
        >
          <Plus className="h-3.5 w-3.5" />
          Aggiungi opportunità
        </button>
      </div>

      {showForm && (
        <RadarPropertyForm
          onCreated={(item) => {
            setItems((current) => [item, ...current]);
            setShowForm(false);
            setOpenId(item.id);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {error && (
        <p role="alert" className="text-sm text-status-blocked">
          {error}
        </p>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Caricamento…</p>}

      {!isLoading && items.length === 0 && !showForm && (
        <div className="card-surface p-8 text-center">
          <Gavel className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">Nessuna opportunità seguita</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Aggiungi un lotto all&apos;asta o un immobile ribassato, poi carica la perizia: in
            pochi secondi hai stato occupazionale, difformità e costi stimati di sanatoria.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => {
          const sconto = scontoPercentuale(item);
          const aperto = openId === item.id;

          return (
            <article key={item.id} className="card-surface overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenId(aperto ? null : item.id)}
                aria-expanded={aperto}
                className="flex w-full items-start gap-3 p-4 text-left transition-colors duration-200 hover:bg-muted/40"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    item.kind === "ASTA"
                      ? "bg-primary/10 text-primary"
                      : "bg-status-pending/10 text-status-pending"
                  )}
                >
                  {item.kind === "ASTA" ? (
                    <Gavel className="h-4 w-4" />
                  ) : (
                    <TrendingDown className="h-4 w-4" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">
                      {PROPERTY_TYPE_LABELS[item.type]} · {item.comune}
                      {item.zona ? ` (${item.zona})` : ""}
                    </h2>

                    {item.appraisal?.status === "PRONTA" && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          RISK_CLASSES[item.appraisal.risk]
                        )}
                      >
                        {RISK_LABELS[item.appraisal.risk]}
                      </span>
                    )}
                    {item.appraisal?.status === "IN_ANALISI" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Perizia in analisi
                      </span>
                    )}
                    {item.appraisal?.status === "FALLITA" && (
                      <span className="rounded-full bg-status-blocked/10 px-2 py-0.5 text-xs font-medium text-status-blocked">
                        Analisi non riuscita
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {euro(item.priceEur)} € · {item.squareMeters} mq
                    {sconto !== null && (
                      <span className="ml-1.5 font-medium text-status-qualified">
                        −{sconto}% sul{" "}
                        {item.kind === "ASTA" ? "valore di perizia" : "prezzo precedente"}
                      </span>
                    )}
                    {item.auctionDate && (
                      <span className="ml-1.5">
                        · asta il{" "}
                        {new Date(item.auctionDate).toLocaleDateString("it-IT", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                    )}
                  </p>

                  {item.appraisal?.status === "PRONTA" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Stato: {OCCUPANCY_LABELS[item.appraisal.occupancy]}
                    </p>
                  )}
                </div>
              </button>

              {aperto && (
                <div className="border-t border-border p-4">
                  <AppraisalPanel radarPropertyId={item.id} onChanged={load} />
                </div>
              )}
            </article>
          );
        })}
      </div>

      {items.length > 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">{AI_DISCLAIMER}</p>
      )}
    </div>
  );
}
