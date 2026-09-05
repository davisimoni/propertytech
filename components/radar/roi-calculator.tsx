"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, Loader2, Save } from "lucide-react";
import { computeRoi, suggestRoiInputs } from "@/lib/radar/roi";
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
  /*
   * Le ipotesi di partenza, calcolate una volta sola per lotto.
   *
   * Sono suggerimenti, non valori: entrano nei campi solo dove l'agente non
   * ha gia' salvato qualcosa di suo, e restano scritti sotto ciascuno perche'
   * si veda da dove escono. Un numero che compare senza spiegazione in un
   * simulatore economico o viene creduto o viene cancellato, e nessuna delle
   * due e' quello che serve.
   */
  const stime = useMemo(
    () =>
      suggestRoiInputs({
        priceEur: item.priceEur,
        appraisedValueEur: item.basePriceEur ?? null,
        remediationCostMaxEur: suggestedRenovationEur,
      }),
    [item.priceEur, item.basePriceEur, suggestedRenovationEur]
  );

  const [transfer, setTransfer] = useState("");
  const [renovation, setRenovation] = useState("");
  const [market, setMarket] = useState("");
  const [rent, setRent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [salvato, setSalvato] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Il valore salvato vince sempre sulla stima.
   *
   * Quello che l'agente ha scritto e salvato e' una decisione dell'agenzia:
   * sovrascriverla con un'ipotesi nostra al ricaricamento della scheda
   * cancellerebbe una correzione voluta, ed e' il modo piu' rapido per far
   * smettere di fidarsi del simulatore.
   */
  useEffect(() => {
    const daSalvatoOStima = (salvato: number | null, stima: { value: number } | null) =>
      salvato != null ? String(salvato) : stima != null ? String(stima.value) : "";

    setTransfer(daSalvatoOStima(item.transferCostsEur, stime.transferCostsEur));
    setRenovation(daSalvatoOStima(item.renovationCostEur, stime.renovationCostEur));
    setMarket(daSalvatoOStima(item.marketValueEur, stime.marketValueEur));
    setRent(daSalvatoOStima(item.monthlyRentEur, stime.monthlyRentEur));
  }, [item, stime]);

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

      {/* La provenienza sotto ogni campo, ma SOLO finche' e' una stima
          nostra: dal momento in cui l'agente salva un valore suo, quella
          riga direbbe una cosa falsa sul numero che ha davanti. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <CampoEuro
          label="Imposte e spese di trasferimento"
          value={transfer}
          onChange={setTransfer}
          hint={item.transferCostsEur == null ? stime.transferCostsEur?.basis : undefined}
        />
        <CampoEuro
          label="Ristrutturazione e sanatoria"
          value={renovation}
          onChange={setRenovation}
          hint={item.renovationCostEur == null ? stime.renovationCostEur?.basis : undefined}
        />
        <CampoEuro
          label="Valore di mercato a lavori conclusi"
          value={market}
          onChange={setMarket}
          hint={item.marketValueEur == null ? stime.marketValueEur?.basis : undefined}
        />
        <CampoEuro
          label="Canone mensile atteso"
          value={rent}
          onChange={setRent}
          hint={item.monthlyRentEur == null ? stime.monthlyRentEur?.basis : undefined}
        />
      </div>

      {/* Detto una volta, sopra i conti: sono ipotesi, non una valutazione. */}
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        I campi che riportano una nota sotto sono <strong>ipotesi di partenza</strong>, non stime
        della tua zona: correggile con i numeri veri appena li hai. I conti qui sotto si
        aggiornano mentre scrivi.
      </p>

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
          className="inline-flex h-11 items-center sm:h-9 gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted disabled:opacity-50"
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
        className="input-field h-11 sm:h-9 text-base sm:text-sm"
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
