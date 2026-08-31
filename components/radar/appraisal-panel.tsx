"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, FileUp, Loader2, ShieldCheck } from "lucide-react";
import { OCCUPANCY_LABELS, RISK_CLASSES, RISK_LABELS } from "@/lib/radar/risk";
import { AI_DISCLAIMER } from "@/lib/compliance";
import { cn } from "@/lib/utils";
import type { AppraisalStatus, OccupancyStatus, RiskLevel } from "@prisma/client";

interface Appraisal {
  id: string;
  status: AppraisalStatus;
  failureReason: string | null;
  occupancy: OccupancyStatus;
  risk: RiskLevel;
  riskReasons: string[];
  irregularities: string[];
  encumbrances: string[];
  remediationCostMinEur: number | null;
  remediationCostMaxEur: number | null;
  summary: string | null;
  pageRange: string | null;
}

const euro = (v: number) => new Intl.NumberFormat("it-IT").format(v);

/**
 * Caricamento della perizia e sintesi.
 *
 * L'analisi è asincrona: il caricamento risponde subito e la scheda si popola
 * quando il lavoro finisce. Qui si interroga lo stato finché non c'è un esito
 * — pronto o fallito — così l'agente non deve ricaricare la pagina per
 * scoprire com'è andata.
 */
export function AppraisalPanel({
  radarPropertyId,
  onChanged,
}: {
  radarPropertyId: string;
  onChanged: () => void;
}) {
  const [appraisal, setAppraisal] = useState<Appraisal | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageRange, setPageRange] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/radar/properties/${radarPropertyId}/appraisal`);
    if (!response.ok) return;
    const data: { appraisal: Appraisal | null } = await response.json();
    setAppraisal(data.appraisal);
  }, [radarPropertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (appraisal?.status !== "IN_ANALISI") return;
    const timer = setInterval(() => {
      void load();
      onChanged();
    }, 5_000);
    return () => clearInterval(timer);
  }, [appraisal?.status, load, onChanged]);

  async function upload(file: File) {
    setIsUploading(true);
    setError(null);

    const form = new FormData();
    form.append("file", file);
    if (pageRange.trim()) form.append("pageRange", pageRange.trim());

    try {
      const response = await fetch(`/api/radar/properties/${radarPropertyId}/appraisal`, {
        method: "POST",
        body: form,
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.message ?? `Caricamento non riuscito (errore ${response.status}).`);
        return;
      }

      setAppraisal(data.appraisal);
      onChanged();
    } catch {
      setError("Errore di rete. La perizia non è stata caricata.");
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const inAnalisi = appraisal?.status === "IN_ANALISI";

  return (
    <div className="space-y-4">
      {/* --- Caricamento --- */}
      {(!appraisal || appraisal.status !== "PRONTA") && (
        <div className="rounded-lg border border-dashed border-border p-4">
          <h3 className="text-sm font-medium text-foreground">Perizia di stima</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Carica il PDF: in pochi secondi ottieni stato occupazionale, difformità, vincoli e
            costi stimati di sanatoria. Il file non viene conservato — resta in memoria il tempo
            dell&apos;analisi e viene scartato.
          </p>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor={`pagine-${radarPropertyId}`} className="text-xs font-medium text-foreground">
                Pagine <span className="font-normal text-muted-foreground">(facoltativo)</span>
              </label>
              <input
                id={`pagine-${radarPropertyId}`}
                value={pageRange}
                onChange={(event) => setPageRange(event.target.value)}
                placeholder="Es. 1-25"
                className="input-field mt-1.5 w-32 text-base sm:text-sm"
              />
            </div>

            <label
              className={cn(
                "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-gradient px-3 text-xs font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110",
                (isUploading || inAnalisi) && "pointer-events-none opacity-50"
              )}
            >
              {isUploading || inAnalisi ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileUp className="h-3.5 w-3.5" />
              )}
              {inAnalisi ? "Analisi in corso…" : "Carica perizia (PDF)"}
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="sr-only"
                disabled={isUploading || inAnalisi}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
            </label>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            Perizia molto lunga? Indica l&apos;intervallo di pagine con le sezioni che contano:
            l&apos;analisi lavora su quelle e arriva in fondo.
          </p>

          {appraisal?.status === "FALLITA" && appraisal.failureReason && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-lg border border-status-blocked/30 bg-status-blocked/5 p-2.5 text-xs text-foreground"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-blocked" />
              {appraisal.failureReason}
            </p>
          )}

          {error && (
            <p role="alert" className="mt-2 text-xs text-status-blocked">
              {error}
            </p>
          )}
        </div>
      )}

      {/* --- Esito --- */}
      {appraisal?.status === "PRONTA" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-semibold",
                RISK_CLASSES[appraisal.risk]
              )}
            >
              {RISK_LABELS[appraisal.risk]}
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              {OCCUPANCY_LABELS[appraisal.occupancy]}
            </span>
            {appraisal.pageRange && (
              <span className="text-xs text-muted-foreground">
                analisi limitata alle pagine {appraisal.pageRange}
              </span>
            )}
          </div>

          {/* I criteri accanto al colore: l'agente deve poter vedere *perché*,
              non solo che è rosso. */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Come è stato calcolato
            </h4>
            <ul className="mt-2 space-y-1">
              {appraisal.riskReasons.map((r) => (
                <li key={r} className="text-xs leading-relaxed text-muted-foreground">
                  · {r}
                </li>
              ))}
            </ul>
          </div>

          {appraisal.summary && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sintesi
              </h4>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {appraisal.summary}
              </p>
            </div>
          )}

          <Elenco titolo="Difformità rilevate" voci={appraisal.irregularities} />
          <Elenco titolo="Vincoli e gravami" voci={appraisal.encumbrances} />

          {(appraisal.remediationCostMinEur !== null || appraisal.remediationCostMaxEur !== null) && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Costo stimato di sanatoria
              </h4>
              <p className="mt-1 text-sm font-medium text-foreground">
                {appraisal.remediationCostMinEur !== null && appraisal.remediationCostMaxEur !== null
                  ? `${euro(appraisal.remediationCostMinEur)} – ${euro(appraisal.remediationCostMaxEur)} €`
                  : `${euro(appraisal.remediationCostMaxEur ?? appraisal.remediationCostMinEur ?? 0)} €`}
              </p>
            </div>
          )}

          <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
            {AI_DISCLAIMER}
          </p>
        </div>
      )}
    </div>
  );
}

function Elenco({ titolo, voci }: { titolo: string; voci: string[] }) {
  if (voci.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titolo}
      </h4>
      <ul className="mt-1.5 space-y-1.5">
        {voci.map((voce) => (
          <li key={voce} className="flex items-start gap-2 text-sm leading-relaxed text-foreground">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
            {voce}
          </li>
        ))}
      </ul>
    </div>
  );
}
