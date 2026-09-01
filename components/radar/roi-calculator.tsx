"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, Loader2, Save } from "lucide-react";
import { computeRoi } from "@/lib/radar/roi";
import { cn } from "@/lib/utils";
import type { RadarItem } from "./radar-board";

/**
 * Simulatore economico dell'operazione.
 *
 * # Perché i campi sono modificabili e non solo calcolati
 *
 * Il costo di sanatoria arriva dalla perizia, ma il perito stima il minimo per
 * mettersi in regola, non il costo di rimettere a nuovo per rivendere. Valore
 * di mercato e canone non stanno in nessun documento: li sa chi conosce quella
 * via. Un simulatore che non si può correggere produce un numero che nessuno
 * userà davvero.
 *
 * # Perché nessun campo è obbligatorio
 *
 * Il capitale investito si calcola comunque, e i due indici compaiono quando
 * ci sono i dati che li rendono possibili. L'alternativa — bloccare tutto
 * finché non si compila l'ultimo campo — significa non vedere mai il primo
 * numero utile.
 */

const euro = (v: number) => new Intl.NumberFormat("it-IT").format(v);
const numero = (v: string): number | null => {
  const pulito = v.replace(/[.\s€]/g, "").trim();
  if (!pulito) return null;
  const n = Number(pulito);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

export function RoiCalculator({
  item,
  suggestedRenovationEur,
  onSaved,
}: {
  item: RadarItem;
  /** Stima della perizia, usata come primo valore se l'agente non ne ha uno. */
  suggestedRenovationEur: number | null;
  onSaved: () => void;
}) {
  const [transfer, setTransfer] = useState("");
  const [renovation, setRenovation] = useState("");
  const [market, setMarket] = useState("");
  const [rent, setRent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [salvato, setSalvato] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTransfer(item.transferCostsEur != null ? String(item.transferCostsEur) : "");
    setRenovation(
      item.renovationCostEur != null
        ? String(item.renovationCostEur)
        : suggestedRenovationEur != null
          ? String(suggestedRenovationEur)
          : ""
    );
    setMarket(item.marketValueEur != null ? String(item.marketValueEur) : "");
    setRent(item.monthlyRentEur != null ? String(item.monthlyRentEur) : "");
  }, [item, suggestedRenovationEur]);

  const risultato = useMemo(
    () =>
      computeRoi({
        priceEur: item.priceEur,
        transferCostsEur: numero(transfer),
        renovationCostEur: numero(renovation),
        marketValueEur: numero(market),
        monthlyRentEur: numero(rent),
      }),
    [item.priceEur, transfer, renovation, market, rent]
  );

  async function salva() {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/radar/properties/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transferCostsEur: numero(transfer),
          renovationCostEur: numero(renovation),
          marketValueEur: numero(market),
          monthlyRentEur: numero(rent),
        }),
      });
      if (!response.ok) throw new Error();
      setSalvato(true);
      setTimeout(() => setSalvato(false), 2500);
      onSaved();
    } catch {
      setError("Salvataggio non riuscito.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section>
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Calculator className="h-3.5 w-3.5" />
        Simulatore economico
      </h3>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <CampoEuro label="Imposte e spese di trasferimento" value={transfer} onChange={setTransfer} />
        <CampoEuro
          label="Ristrutturazione e sanatoria"
          value={renovation}
          onChange={setRenovation}
          hint={
            suggestedRenovationEur != null && item.renovationCostEur == null
              ? "precompilato dalla perizia"
              : undefined
          }
        />
        <CampoEuro label="Valore di mercato a lavori conclusi" value={market} onChange={setMarket} />
        <CampoEuro label="Canone mensile atteso" value={rent} onChange={setRent} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Kpi
          label="Capitale investito"
          value={`${euro(risultato.totalInvestedEur)} €`}
          hint="base + sanatoria + imposte"
        />
        <Kpi
          label="Margine sulla rivendita"
          value={risultato.flipRoiPct !== null ? `${risultato.flipRoiPct}%` : "—"}
          hint={
            risultato.flipMarginEur !== null ? `${euro(risultato.flipMarginEur)} €` : "manca il valore di mercato"
          }
          tone={
            risultato.flipRoiPct === null ? "neutro" : risultato.flipRoiPct >= 0 ? "positivo" : "negativo"
          }
        />
        <Kpi
          label="Rendimento lordo annuo"
          value={risultato.grossYieldPct !== null ? `${risultato.grossYieldPct}%` : "—"}
          hint={risultato.grossYieldPct !== null ? "da locazione" : "manca il canone atteso"}
        />
      </div>

      {risultato.missing.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Per completare il quadro manca: {risultato.missing.join(", ")}.
        </p>
      )}

      {/* Detto una volta, in chiaro: un rendimento lordo che ignora tre mesi di
          cantiere è ottimista di tre mesi, e chi legge il prospetto deve
          saperlo prima di firmare un assegno circolare. */}
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Il calcolo è lordo: non considera interessi su finanziamenti, tempi di aggiudicazione e di
        cantiere, costi di gestione, sfitto né imposte sulla plusvalenza.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={salva}
          disabled={isSaving}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {salvato ? "Salvato" : "Salva parametri"}
        </button>

        <p className="text-xs text-muted-foreground">
          {risultato.flipRoiPct === null && risultato.grossYieldPct === null
            ? "Compila il valore di mercato o il canone atteso per poter inviare il prospetto."
            : "Il prospetto si invia dagli abbinamenti qui sotto, scegliendo il destinatario."}
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-status-blocked">
          {error}
        </p>
      )}
    </section>
  );
}

function CampoEuro({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground">
        {label}
        {hint && <span className="font-normal text-muted-foreground"> ({hint})</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        placeholder="—"
        className="input-field h-9 text-base sm:text-sm"
      />
    </label>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "neutro",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutro" | "positivo" | "negativo";
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold",
          tone === "positivo" && "text-status-qualified",
          tone === "negativo" && "text-status-blocked",
          tone === "neutro" && "text-foreground"
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
