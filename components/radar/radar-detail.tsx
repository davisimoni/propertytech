"use client";

import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Calculator,
  FileDown,
  Loader2,
  Pencil,
  ScanSearch,
  Send,
  Trash2,
  Users,
  ClipboardCheck,
  Copy,
} from "lucide-react";
import { PROPERTY_TYPE_LABELS } from "@/lib/listings/property-fields";
import { RISK_CLASSES, RISK_LABELS } from "@/lib/radar/risk";
import { AUCTION_STATUS_CLASSES, AUCTION_STATUS_LABELS } from "@/lib/radar/tags";
import { buildSocialCopy, type CopyVariant } from "@/lib/radar/social-copy";
import { downloadPdf, fetchPdfBranding } from "@/lib/pdf/client";
import { cn } from "@/lib/utils";
import type { RadarItem } from "./radar-board";
import { AppraisalPanel } from "./appraisal-panel";
import { RoiCalculator } from "./roi-calculator";
import { RadarMatchesCard } from "./radar-matches-card";

/**
 * Scheda di un lotto: intestazione compatta e tre schede.
 *
 * # Perché a schede e non tutto in colonna
 *
 * Perizia, conti e clienti sono tre domande diverse, e chi apre la scheda ne
 * ha in testa una sola: "in che stato è", "quanto rende", "a chi lo propongo".
 * In colonna bisognava scorrere oltre le altre due per arrivare alla propria,
 * e la terza — i lead — finiva sotto il taglio dello schermo proprio nel
 * momento in cui serve alzare il telefono.
 *
 * # Perché l'intestazione resta sempre visibile
 *
 * Indirizzo, prezzo e semaforo sono il contesto di tutto ciò che sta nelle
 * schede: leggere un margine del 30% senza ricordare su quale prezzo è
 * calcolato non serve a niente.
 */

type Scheda = "perizia" | "roi" | "lead";

const euro = (v: number) => new Intl.NumberFormat("it-IT").format(v);

export function RadarDetail({
  item,
  nomeAgenzia,
  onChanged,
  onDeleted,
  onEdit,
}: {
  item: RadarItem;
  /** Firma in fondo al copy: il testo esce a nome dell'agenzia. */
  nomeAgenzia: string;
  onChanged: () => void;
  onDeleted: () => void;
  onEdit: () => void;
}) {
  const [scheda, setScheda] = useState<Scheda>("perizia");
  const [inCorso, setInCorso] = useState(false);
  const [inStampa, setInStampa] = useState(false);
  const [conferma, setConferma] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);
  const [copiato, setCopiato] = useState<CopyVariant | null>(null);

  const pronta = item.appraisal?.status === "PRONTA";
  const roiDisponibile = item.marketValueEur !== null || item.monthlyRentEur !== null;
  const luogo = [item.address, item.zona].filter(Boolean).join(", ");

  async function patch(body: Record<string, unknown>, messaggio: string) {
    setInCorso(true);
    setError(null);
    setAvviso(null);
    try {
      const response = await fetch(`/api/radar/properties/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError("Operazione non riuscita.");
        return;
      }
      setAvviso(messaggio);
      onChanged();
    } catch {
      setError("Errore di rete.");
    } finally {
      setInCorso(false);
    }
  }

  /**
   * Report PDF del lotto.
   *
   * La perizia viene riletta dalla sua rotta e non presa dall'elenco, che ne
   * porta solo il riassunto: stampare un report senza difformità né vincoli
   * sarebbe peggio che non stamparlo.
   */
  async function scaricaReport() {
    setInStampa(true);
    setError(null);
    try {
      const [branding, perizia] = await Promise.all([
        fetchPdfBranding(),
        fetch(`/api/radar/properties/${item.id}/appraisal`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      const { RadarReportDocument } = await import("@/lib/pdf/radar-report-document");

      await downloadPdf(
        <RadarReportDocument
          branding={branding}
          data={{
            kind: item.kind,
            comune: item.comune,
            zona: item.zona,
            address: item.address,
            type: item.type,
            squareMeters: item.squareMeters,
            priceEur: item.priceEur,
            basePriceEur: item.basePriceEur,
            auctionDate: item.auctionDate,
            lotto: item.lotto,
            transferCostsEur: item.transferCostsEur,
            renovationCostEur: item.renovationCostEur,
            marketValueEur: item.marketValueEur,
            monthlyRentEur: item.monthlyRentEur,
            appraisal: perizia?.appraisal ?? null,
          }}
        />,
        `radar-${item.comune.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`
      );
    } catch {
      setError("Non è stato possibile generare il report.");
    } finally {
      setInStampa(false);
    }
  }

  /**
   * Copia negli appunti il testo pronto da pubblicare.
   *
   * Due versioni perche' sono due pubblici opposti: il post lo legge un
   * acquirente, a cui dire quanto pensiamo di guadagnarci non aiuta a
   * vendere; la lettera all'investitore vive proprio di quel numero. Il
   * semaforo e le difformita' non entrano in nessuna delle due — sono la
   * lettura automatica di una perizia, e trasformarle in un'affermazione
   * pubblica su un immobile significherebbe risponderne.
   */
  async function copiaCopy(variant: CopyVariant) {
    setError(null);
    const testo = buildSocialCopy(
      {
        kind: item.kind,
        comune: item.comune,
        zona: item.zona,
        type: item.type,
        squareMeters: item.squareMeters,
        priceEur: item.priceEur,
        basePriceEur: item.basePriceEur,
        previousPriceEur: item.previousPriceEur,
        auctionDate: item.auctionDate,
        transferCostsEur: item.transferCostsEur,
        renovationCostEur: item.renovationCostEur,
        marketValueEur: item.marketValueEur,
        monthlyRentEur: item.monthlyRentEur,
        agencyName: nomeAgenzia,
      },
      variant
    );

    try {
      await navigator.clipboard.writeText(testo);
      setCopiato(variant);
      setTimeout(() => setCopiato(null), 2500);
    } catch {
      // Gli appunti richiedono un contesto sicuro e il permesso: se manca,
      // meglio dirlo che lasciare l'agente a chiedersi se ha copiato.
      setError("Il browser non ha concesso l'accesso agli appunti. Copia il testo a mano.");
    }
  }

  async function elimina() {
    setInCorso(true);
    try {
      const response = await fetch(`/api/radar/properties/${item.id}?confirm=true`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setError("Eliminazione non riuscita.");
        return;
      }
      setConferma(false);
      onDeleted();
    } catch {
      setError("Errore di rete.");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* --- Intestazione compatta --- */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-muted/30 p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {luogo || PROPERTY_TYPE_LABELS[item.type]}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.comune} · {PROPERTY_TYPE_LABELS[item.type]} · {item.squareMeters} mq
            {item.lotto ? ` · lotto ${item.lotto}` : ""}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold text-foreground">{euro(item.priceEur)} €</span>
            <span className="text-xs text-muted-foreground">
              {item.kind === "ASTA" ? "offerta minima" : "prezzo attuale"}
            </span>
            {pronta && item.appraisal && (
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold",
                  RISK_CLASSES[item.appraisal.risk]
                )}
              >
                {RISK_LABELS[item.appraisal.risk]}
              </span>
            )}
            {item.auctionStatus && (
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  AUCTION_STATUS_CLASSES[item.auctionStatus]
                )}
              >
                {AUCTION_STATUS_LABELS[item.auctionStatus]}
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={scaricaReport}
            disabled={inStampa}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 disabled:opacity-50"
          >
            {inStampa ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            Scarica report PDF
          </button>

          {/* Porta alla scheda dei lead invece di inviare: il destinatario si
              sceglie, e un tasto che spedisce senza chiedere a chi sarebbe il
              contrario di quanto deciso per le proposte. */}
          <button
            type="button"
            onClick={() => setScheda("lead")}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-gradient px-3 text-xs font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110"
          >
            <Send className="h-3.5 w-3.5" />
            Invia prospetto WA
          </button>
        </div>
      </div>

      {avviso && <p className="text-xs text-status-qualified">{avviso}</p>}
      {error && (
        <p role="alert" className="text-xs text-status-blocked">
          {error}
        </p>
      )}

      {/* --- Schede --- */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {(
          [
            ["perizia", "Analisi perizia e rischi", ScanSearch],
            ["roi", "Business plan e ROI", Calculator],
            ["lead", `Lead compatibili${item._count.matches ? ` (${item._count.matches})` : ""}`, Users],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setScheda(id)}
            aria-pressed={scheda === id}
            className={cn(
              "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors duration-200",
              scheda === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="pt-1">
        {scheda === "perizia" && (
          <AppraisalPanel radarPropertyId={item.id} onChanged={onChanged} />
        )}
        {scheda === "roi" && (
          <RoiCalculator
            item={item}
            suggestedRenovationEur={item.appraisal?.remediationCostMaxEur ?? null}
            onSaved={onChanged}
          />
        )}
        {scheda === "lead" && (
          <RadarMatchesCard radarPropertyId={item.id} roiDisponibile={roiDisponibile} />
        )}
      </div>

      {/* --- Comandi secondari, in fondo --- */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-10 items-center sm:h-8 gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
        >
          <Pencil className="h-3.5 w-3.5" />
          Modifica dati
        </button>

        <button
          type="button"
          disabled={inCorso}
          onClick={() =>
            patch(
              { archived: item.archivedAt === null },
              item.archivedAt === null
                ? "Archiviata: non compare più in elenco."
                : "Ripristinata in elenco."
            )
          }
          className="inline-flex h-10 items-center sm:h-8 gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted disabled:opacity-50"
        >
          {item.archivedAt === null ? (
            <>
              <Archive className="h-3.5 w-3.5" />
              Archivia / aggiudicata
            </>
          ) : (
            <>
              <ArchiveRestore className="h-3.5 w-3.5" />
              Ripristina
            </>
          )}
        </button>

        {(
          [
            ["social", "Copy social"],
            ["investitori", "Copy investitori"],
          ] as const
        ).map(([variant, etichetta]) => (
          <button
            key={variant}
            type="button"
            onClick={() => copiaCopy(variant)}
            className="inline-flex h-10 items-center sm:h-8 gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
          >
            {copiato === variant ? (
              <ClipboardCheck className="h-3.5 w-3.5 text-status-qualified" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copiato === variant ? "Copiato" : etichetta}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setConferma(true)}
          className="inline-flex h-10 items-center sm:h-8 gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-status-blocked transition-all duration-200 hover:border-status-blocked/40 hover:bg-status-blocked/5"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Elimina
        </button>

        {inCorso && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {conferma && (
        <div role="dialog" aria-modal="true" aria-label="Conferma eliminazione" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-lg">
            <h4 className="text-sm font-semibold text-foreground">Eliminare questa opportunità?</h4>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Vengono cancellati anche la sintesi della perizia e gli abbinamenti con i lead.
              L&apos;operazione non è reversibile.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Se l&apos;asta si è semplicemente conclusa conviene <strong>archiviarla</strong>:
              esce dall&apos;elenco ma resta consultabile, con la storia di cosa è stato proposto a
              chi.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              {/* Il fuoco iniziale su Annulla: il primo tasto raggiunto da
                  tastiera non deve essere quello che cancella. */}
              <button type="button" autoFocus onClick={() => setConferma(false)} className="h-9 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors duration-200 hover:bg-muted">
                Annulla
              </button>
              <button type="button" onClick={elimina} disabled={inCorso} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-status-blocked px-3 text-xs font-medium text-white transition-all duration-200 hover:brightness-110 disabled:opacity-50">
                {inCorso && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Elimina definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
