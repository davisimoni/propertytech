"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ArchiveRestore, ArrowDown, Gavel, Loader2, Map as MapIcon, Plus, Radar, Table2, TrendingDown, Users } from "lucide-react";
import { PROPERTY_TYPE_LABELS } from "@/lib/listings/property-fields";
import { RISK_CLASSES, RISK_LABELS, OCCUPANCY_LABELS } from "@/lib/radar/risk";
import { RadarDrawer } from "./radar-drawer";
import { RadarDetail } from "./radar-detail";
import { AUCTION_STATUS_CLASSES, AUCTION_STATUS_LABELS, RADAR_TAGS } from "@/lib/radar/tags";
import { AI_DISCLAIMER } from "@/lib/compliance";
import { cn } from "@/lib/utils";
import type {
  AppraisalStatus,
  AuctionStatus,
  OccupancyStatus,
  PropertyType,
  RiskLevel,
} from "@prisma/client";

/*
 * Leaflet tocca `window` al caricamento: importato normalmente romperebbe il
 * rendering sul server. Caricato solo nel browser e solo quando si passa alla
 * vista mappa, cosi' chi resta in tabella non ne scarica il codice.
 */
const RadarMap = dynamic(() => import("./radar-map").then((m) => m.RadarMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[28rem] items-center justify-center rounded-xl border border-border bg-muted/30">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
});

export interface RadarItem {
  id: string;
  kind: "ASTA" | "RIBASSO";
  comune: string;
  zona: string | null;
  address: string | null;
  type: PropertyType;
  priceEur: number;
  squareMeters: number;
  basePriceEur: number | null;
  previousPriceEur: number | null;
  auctionDate: string | null;
  lotto: string | null;
  sourceUrl: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  transferCostsEur: number | null;
  renovationCostEur: number | null;
  marketValueEur: number | null;
  monthlyRentEur: number | null;
  priceDropPct: number | null;
  priceDropNewMatches: number | null;
  priceDropSeenAt: string | null;
  archivedAt: string | null;
  tags: string[];
  auctionStatus: AuctionStatus | null;
  appraisal: {
    status: AppraisalStatus;
    risk: RiskLevel;
    riskReasons: string[];
    occupancy: OccupancyStatus;
    failureReason: string | null;
    remediationCostMaxEur: number | null;
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

export function RadarBoard({ nomeAgenzia }: { nomeAgenzia: string }) {
  const [items, setItems] = useState<RadarItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  /**
   * Pannello laterale: `"nuovo"` per creare, un lotto per modificarlo,
   * `null` chiuso. Un solo stato per due usi, perche' sono lo stesso
   * pannello e due stati distinti finirebbero per aprirsi insieme.
   */
  const [drawer, setDrawer] = useState<RadarItem | "nuovo" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<"table" | "map">("table");
  const [filtroTipo, setFiltroTipo] = useState<"TUTTI" | "ASTA" | "RIBASSO">("TUTTI");
  const [filtroRischio, setFiltroRischio] = useState<"TUTTI" | RiskLevel | "IGNOTO">("TUTTI");
  const [budgetMax, setBudgetMax] = useState("");
  const [zona, setZona] = useState("");
  /*
   * Attive o archiviate: e' una VISTA, non un filtro.
   *
   * Stava fra i filtri, sesta tendina di sette, con un SI/NO. Nessuno cerca
   * "dove sono le archiviate" dentro un menu a tendina in mezzo a budget e
   * zona: la funzione c'era e risultava assente. Ora e' una scheda accanto a
   * Tabella/Mappa, col numero di quelle archiviate scritto sopra.
   */
  const [vistaArchivio, setVistaArchivio] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);
  const [ripristinando, setRipristinando] = useState<string | null>(null);
  const [filtroTag, setFiltroTag] = useState<string>("TUTTI");
  const [filtroFase, setFiltroFase] = useState<string>("TUTTE");

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/radar/properties${vistaArchivio ? "?archived=only" : ""}`
      );
      if (!response.ok) throw new Error();
      const data: { items: RadarItem[]; archivedCount?: number } = await response.json();
      setItems(data.items);
      // Il conteggio arriva con entrambe le viste: la scheda "Archiviate (N)"
      // deve poter mostrare il numero mentre si guardano le attive.
      setArchivedCount(data.archivedCount ?? 0);
      setError(null);
    } catch {
      setError("Non è stato possibile caricare le opportunità.");
    } finally {
      setIsLoading(false);
    }
  }, [vistaArchivio]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Riporta un'opportunita' fra le attive.
   *
   * Sta qui e non solo dentro la scheda di dettaglio: nella vista archivio
   * l'unica cosa che si vuole fare e' ripescarne una, e obbligare ad aprirla
   * per trovare il pulsante e' un passaggio in piu' su ogni riga.
   *
   * L'elenco si aggiorna togliendo la riga sul posto, senza ricaricare: la
   * vista archivio non deve piu' mostrarla, e il contatore scende di uno.
   */
  const ripristina = useCallback(async (id: string) => {
    setRipristinando(id);
    try {
      const response = await fetch(`/api/radar/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false }),
      });
      if (!response.ok) throw new Error();

      setItems((correnti) => correnti.filter((i) => i.id !== id));
      setArchivedCount((n) => Math.max(0, n - 1));
      setError(null);
    } catch {
      setError("Non è stato possibile ripristinare l'opportunità.");
    } finally {
      setRipristinando(null);
    }
  }, []);

  /*
   * Si ricontrolla solo finché c'è qualcosa in analisi.
   *
   * L'analisi di una perizia è asincrona: la scheda nasce "in analisi" e si
   * completa da sola. Un polling costante costerebbe una richiesta ogni
   * cinque secondi anche a schermo fermo, quindi si accende quando serve e si
   * spegne quando tutte le perizie hanno un esito.
   */
  const inAnalisi = items.some((item) => item.appraisal?.status === "IN_ANALISI");

  /*
   * I filtri lavorano sull'elenco gia' scaricato.
   *
   * Sono quattro criteri su un insieme che la rotta limita a 200 righe: un
   * giro di rete a ogni spunta darebbe una risposta piu' lenta di un
   * `filter` in memoria, e renderebbe la mappa scattosa mentre si stringe il
   * budget con il cursore.
   */
  const visibili = items.filter((item) => {
    if (filtroTipo !== "TUTTI" && item.kind !== filtroTipo) return false;

    if (filtroRischio !== "TUTTI") {
      const pronta = item.appraisal?.status === "PRONTA";
      if (filtroRischio === "IGNOTO") {
        if (pronta) return false;
      } else if (!pronta || item.appraisal?.risk !== filtroRischio) {
        return false;
      }
    }

    if (budgetMax.trim()) {
      const tetto = Number(budgetMax.replace(/[.\s]/g, ""));
      if (Number.isFinite(tetto) && tetto > 0 && item.priceEur > tetto) return false;
    }

    if (filtroTag !== "TUTTI" && !item.tags.includes(filtroTag)) return false;

    if (filtroFase !== "TUTTE" && item.auctionStatus !== filtroFase) return false;

    if (zona.trim()) {
      const cercato = zona.trim().toLowerCase();
      const dove = `${item.comune} ${item.zona ?? ""}`.toLowerCase();
      if (!dove.includes(cercato)) return false;
    }

    return true;
  });

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
            : visibili.length === items.length
              ? `${items.length} opportunità · ${items.filter((i) => i.kind === "ASTA").length} aste`
              : `${visibili.length} di ${items.length} opportunità`}
          {inAnalisi && (
            <span className="ml-2 inline-flex items-center gap-1 text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              perizia in analisi
            </span>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {/* Attive / Archiviate: la vista, prima del come la si guarda. */}
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(
              [
                [false, "Attive"],
                [true, archivedCount > 0 ? `Archiviate (${archivedCount})` : "Archiviate"],
              ] as const
            ).map(([archivio, label]) => (
              <button
                key={String(archivio)}
                type="button"
                onClick={() => setVistaArchivio(archivio)}
                aria-pressed={vistaArchivio === archivio}
                className={cn(
                  "inline-flex h-11 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-200 sm:h-auto sm:py-1.5",
                  vistaArchivio === archivio
                    ? "bg-brand-gradient text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {archivio ? (
                  <ArchiveRestore className="h-3.5 w-3.5" />
                ) : (
                  <Radar className="h-3.5 w-3.5" />
                )}
                {label}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(
              [
                ["table", "Tabella", Table2],
                ["map", "Mappa", MapIcon],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-pressed={view === id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-200",
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
          onClick={() => setDrawer("nuovo")}
          className="inline-flex h-11 items-center sm:h-9 gap-1.5 rounded-lg bg-brand-gradient px-3 text-xs font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuova opportunità
        </button>
        </div>
      </div>

      {/* Filtri: valgono per entrambe le viste, così passando da tabella a
          mappa si continua a guardare lo stesso insieme.

          In griglia e non in flex-wrap: sette filtri con larghezze fisse
          (w-36, w-44) su uno schermo da 375px si disponevano a gradini, con
          l'ultimo da solo su una riga mezza vuota. Due per riga sul telefono,
          quattro sul desktop — la stessa disposizione del portafoglio, perche'
          due elenchi che si filtrano allo stesso modo non devono avere due
          barre diverse. */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-3 lg:grid-cols-4">
          <Filtro label="Tipo">
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)}
              className="input-field h-11 sm:h-9 w-full text-base sm:text-sm"
            >
              <option value="TUTTI">Tutte</option>
              <option value="ASTA">Aste</option>
              <option value="RIBASSO">Ribassi</option>
            </select>
          </Filtro>

          <Filtro label="Rischio">
            <select
              value={filtroRischio}
              onChange={(e) => setFiltroRischio(e.target.value as typeof filtroRischio)}
              className="input-field h-11 sm:h-9 w-full text-base sm:text-sm"
            >
              <option value="TUTTI">Tutti</option>
              <option value="VERDE">Rischio basso</option>
              <option value="GIALLO">Da verificare</option>
              <option value="ROSSO">Rischio alto</option>
              <option value="IGNOTO">Perizia non caricata</option>
            </select>
          </Filtro>

          <Filtro label="Budget massimo (€)">
            <input
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value)}
              inputMode="numeric"
              placeholder="Es. 250.000"
              className="input-field h-11 sm:h-9 w-full text-base sm:text-sm"
            />
          </Filtro>

          <Filtro label="Etichetta">
            <select
              value={filtroTag}
              onChange={(e) => setFiltroTag(e.target.value)}
              className="input-field h-11 sm:h-9 w-full text-base sm:text-sm"
            >
              <option value="TUTTI">Tutte</option>
              {RADAR_TAGS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Filtro>

          <Filtro label="Fase">
            <select
              value={filtroFase}
              onChange={(e) => setFiltroFase(e.target.value)}
              className="input-field h-11 sm:h-9 w-full text-base sm:text-sm"
            >
              <option value="TUTTE">Tutte</option>
              {(Object.keys(AUCTION_STATUS_LABELS) as AuctionStatus[]).map((v) => (
                <option key={v} value={v}>
                  {AUCTION_STATUS_LABELS[v]}
                </option>
              ))}
            </select>
          </Filtro>


          <Filtro label="Comune o zona">
            <input
              value={zona}
              onChange={(e) => setZona(e.target.value)}
              placeholder="Es. Vignola"
              className="input-field h-11 sm:h-9 w-full text-base sm:text-sm"
            />
          </Filtro>

          {(filtroTipo !== "TUTTI" ||
            filtroRischio !== "TUTTI" ||
            filtroTag !== "TUTTI" ||
            filtroFase !== "TUTTE" ||
            budgetMax ||
            zona) && (
            <button
              type="button"
              onClick={() => {
                setFiltroTipo("TUTTI");
                setFiltroRischio("TUTTI");
                setFiltroTag("TUTTI");
                setFiltroFase("TUTTE");
                setBudgetMax("");
                setZona("");
              }}
              className="h-11 sm:h-9 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted"
            >
              Azzera filtri
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-status-blocked">
          {error}
        </p>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Caricamento…</p>}

      {/* Due vuoti diversi, perche' sono due situazioni diverse.

          L'archivio vuoto non e' un'agenzia che non ha ancora cominciato: e'
          un'agenzia che non ha archiviato niente. Mostrarle l'invito a
          "aggiungi il primo lotto" mentre ha venti opportunita' attive
          suggerirebbe che il Radar si sia svuotato. */}
      {!isLoading && items.length === 0 && vistaArchivio && (
        <div className="card-surface p-8 text-center">
          <ArchiveRestore className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">
            Nessuna opportunità archiviata presente
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Qui finiscono le aste aggiudicate e le occasioni che hai chiuso. Le trovi archiviando
            un&apos;opportunità dalla sua scheda, e da qui puoi sempre riportarla fra le attive.
          </p>
          <button
            type="button"
            onClick={() => setVistaArchivio(false)}
            className="btn-outline mt-4 text-xs"
          >
            <Radar className="h-3.5 w-3.5" />
            Torna alle attive
          </button>
        </div>
      )}

      {!isLoading && items.length === 0 && !vistaArchivio && (
        <div className="card-surface p-8 text-center">
          <Gavel className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">Nessuna opportunità seguita</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Aggiungi un lotto all&apos;asta o un immobile ribassato, poi carica la perizia: in
            pochi secondi hai stato occupazionale, difformità e costi stimati di sanatoria.
          </p>
          {archivedCount > 0 && (
            <button
              type="button"
              onClick={() => setVistaArchivio(true)}
              className="btn-outline mt-4 text-xs"
            >
              <ArchiveRestore className="h-3.5 w-3.5" />
              Vedi le {archivedCount} archiviate
            </button>
          )}
        </div>
      )}

      {view === "map" && items.length > 0 && (
        <RadarMap
          items={visibili}
          onOpenItem={(id) => {
            // Dal pin alla scheda: si torna in tabella e si apre quella
            // riga, perché perizia e abbinamenti vivono lì.
            setView("table");
            setOpenId(id);
          }}
        />
      )}

      {view === "table" && !isLoading && items.length > 0 && visibili.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nessuna opportunità corrisponde ai filtri impostati.
        </p>
      )}

      <div className={cn("space-y-3", view === "map" && "hidden")}>
        {visibili.map((item) => {
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
                    {item.auctionStatus && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          AUCTION_STATUS_CLASSES[item.auctionStatus]
                        )}
                      >
                        {AUCTION_STATUS_LABELS[item.auctionStatus]}
                      </span>
                    )}
                    {item.priceDropPct !== null && item.priceDropPct > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-status-qualified/10 px-2 py-0.5 text-xs font-semibold text-status-qualified">
                        <ArrowDown className="h-3 w-3" />
                        Ribassato del {item.priceDropPct}%
                      </span>
                    )}
                    {/* Quanti contatti ha sbloccato quel ribasso, finché
                        l'agente non l'ha visto. Sta anche qui e non solo in
                        scheda: è la ragione per cui vale la pena aprirla, e
                        dentro la scheda la scoprirebbe solo chi c'è già
                        entrato. Sparisce insieme all'avviso, non prima. */}
                    {item.priceDropSeenAt === null &&
                      (item.priceDropNewMatches ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                          <Users className="h-3 w-3" />
                          {item.priceDropNewMatches} nuovi lead
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

              {/* Ripristino sulla riga, e solo nella vista archivio: e' l'unica
                  azione per cui si entra qui, e farla cercare dentro la scheda
                  aggiungerebbe un passaggio a ogni opportunita'. */}
              {vistaArchivio && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-4 py-2.5">
                  <span className="text-xs text-muted-foreground">
                    Archiviata
                    {item.archivedAt
                      ? ` il ${new Date(item.archivedAt).toLocaleDateString("it-IT", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}`
                      : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => void ripristina(item.id)}
                    disabled={ripristinando === item.id}
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 text-xs font-medium text-primary transition-all duration-200 hover:bg-primary/10 disabled:opacity-50 sm:h-8"
                  >
                    {ripristinando === item.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ArchiveRestore className="h-3.5 w-3.5" />
                    )}
                    {ripristinando === item.id ? "Ripristino…" : "Ripristina"}
                  </button>
                </div>
              )}

              {aperto && (
                <div className="border-t border-border p-4">
                  <RadarDetail
                    item={item}
                    nomeAgenzia={nomeAgenzia}
                    onChanged={load}
                    onEdit={() => setDrawer(item)}
                    onDeleted={() => {
                      setOpenId(null);
                      setItems((current) => current.filter((i) => i.id !== item.id));
                    }}
                  />
                </div>
              )}
            </article>
          );
        })}
      </div>

      {items.length > 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">{AI_DISCLAIMER}</p>
      )}

      {drawer !== null && (
        <RadarDrawer
          item={drawer === "nuovo" ? null : drawer}
          onClose={() => setDrawer(null)}
          onSaved={(salvato, creato) => {
            if (creato) {
              setItems((current) => [salvato, ...current]);
              setOpenId(salvato.id);
            } else {
              setItems((current) =>
                current.map((i) => (i.id === salvato.id ? { ...i, ...salvato } : i))
              );
            }
            // Ricarica comunque: il salvataggio puo' aver rifatto le
            // coordinate o ricalcolato gli abbinamenti, e la riga in elenco
            // deve dirlo.
            void load();
          }}
        />
      )}
    </div>
  );
}

function Filtro({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
