"use client";

import { AlertTriangle, ListChecks, ShieldCheck, TrendingUp } from "lucide-react";
import type { RadarItem } from "@/components/radar/radar-board";
import { RISK_CLASSES, RISK_LABELS } from "@/lib/radar/risk";
import { computeRoi } from "@/lib/radar/roi";
import { InfoTip } from "@/components/shared/info-tip";
import { cn } from "@/lib/utils";

/**
 * I tre numeri che decidono se un lotto merita altro tempo.
 *
 * # Perché in testa, e non dentro le schede
 *
 * Perché prima stavano in tre posti diversi: il rischio nella scheda della
 * perizia, il margine in quella del business plan, la sintesi ancora nella
 * prima. Per farsi un'idea di un lotto bisognava aprirne tre e tenerle a
 * mente — e su venti lotti da vagliare in una sera, quello è il lavoro.
 * Qui stanno insieme e sempre visibili; le schede restano per chi vuole il
 * dettaglio.
 *
 * # Perché il margine non lo ricalcola
 *
 * `computeRoi` è la stessa funzione che alimenta il simulatore. Rifare qui
 * la sottrazione sembrerebbe innocuo finché qualcuno non cambia una regola
 * di là: da quel momento la scheda mostrerebbe un margine e il simulatore un
 * altro, e nessuno dei due direbbe quale è quello giusto.
 */
export function RadarDashboard({ item }: { item: RadarItem }) {
  const analisi = item.appraisal;
  const pronta = analisi?.status === "PRONTA";

  const conti = computeRoi({
    priceEur: item.priceEur,
    transferCostsEur: item.transferCostsEur,
    renovationCostEur: item.renovationCostEur,
    marketValueEur: item.marketValueEur,
    monthlyRentEur: item.monthlyRentEur,
  });

  const euro = (v: number) => `${new Intl.NumberFormat("it-IT").format(Math.round(v))} €`;

  /*
   * I punti della sintesi, con ripiego sulla prosa.
   *
   * Le analisi fatte prima che `summaryPoints` esistesse hanno solo il
   * paragrafo: mostrarlo com'è vale più che spezzarlo sui punti fermi, che
   * sulle abbreviazioni sbaglia.
   */
  const punti = analisi?.summaryPoints?.length ? analisi.summaryPoints : null;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {/* --- 1. Rischio --- */}
      <Riquadro
        icona={ShieldCheck}
        titolo="Rischio e complessità"
        spiegazione="Semaforo calcolato dal codice con criteri dichiarati, non dal modello: pesa stato occupazionale, difformità, vincoli e costo di sanatoria sul valore. Nel dubbio resta giallo, che significa 'da verificare di persona' e mai 'via libera'."
        nota={
          pronta
            ? `${analisi.riskReasons.length} ${analisi.riskReasons.length === 1 ? "criterio" : "criteri"} valutati`
            : "Serve la perizia"
        }
      >
        {pronta ? (
          <>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold",
                RISK_CLASSES[analisi.risk]
              )}
            >
              {RISK_LABELS[analisi.risk]}
            </span>
            {/* Nel dubbio il semaforo resta giallo: e' un punto da verificare
                di persona, mai un via libera. Detto qui perche' e' la lettura
                che un agente di fretta sbaglia piu' facilmente. */}
            {analisi.risk === "GIALLO" && (
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                Da verificare di persona: non è un via libera.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </Riquadro>

      {/* --- 2. Margine --- */}
      <Riquadro
        icona={TrendingUp}
        titolo="Margine stimato"
        spiegazione="Valore di mercato meno il capitale investito (offerta minima + imposte + sanatoria). Usa gli stessi numeri del simulatore, quindi cambia quando li correggi lì. Due dei valori di partenza sono ipotesi nostre dichiarate — imposte al 9%, resa locativa al 5% — non dati della perizia."
        nota={
          conti.flipMarginEur === null
            ? "Manca il valore di mercato"
            : `su ${euro(conti.totalInvestedEur)} investiti`
        }
      >
        {conti.flipMarginEur === null ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={cn(
                "text-lg font-semibold",
                conti.flipMarginEur >= 0 ? "text-status-qualified" : "text-status-blocked"
              )}
            >
              {conti.flipMarginEur >= 0 ? "+" : ""}
              {euro(conti.flipMarginEur)}
            </span>
            {conti.flipRoiPct !== null && (
              <span className="text-xs text-muted-foreground">{conti.flipRoiPct}%</span>
            )}
          </div>
        )}
      </Riquadro>

      {/* --- 3. Sintesi --- */}
      <Riquadro
        icona={ListChecks}
        titolo="Sintesi della perizia"
        spiegazione="Punti ricavati dalla perizia dall'AI, ordinati dal fatto più rilevante. Riportano ciò che il documento dice, non le conclusioni del perito: non sostituiscono la lettura integrale né il sopralluogo."
        nota={pronta ? "Generata dall'AI, da verificare" : "Serve la perizia"}
      >
        {pronta && (punti || analisi.summary) ? (
          punti ? (
            <ul className="space-y-1">
              {punti.slice(0, 4).map((punto) => (
                <li key={punto} className="flex gap-1.5 text-[11px] leading-snug text-muted-foreground">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  {punto}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] leading-snug text-muted-foreground">{analisi.summary}</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </Riquadro>

      {analisi?.status === "FALLITA" && (
        <p className="sm:col-span-3 flex items-start gap-1.5 text-[11px] leading-snug text-status-pending">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          L&apos;analisi della perizia non è riuscita: i tre indicatori restano incompleti finché
          non la ricarichi.
        </p>
      )}
    </div>
  );
}

function Riquadro({
  icona: Icona,
  titolo,
  nota,
  spiegazione,
  children,
}: {
  icona: typeof ShieldCheck;
  titolo: string;
  nota: string;
  spiegazione: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icona className="h-3.5 w-3.5" />
        {titolo}
        <InfoTip label={spiegazione} />
      </p>
      <div className="mt-2">{children}</div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{nota}</p>
    </div>
  );
}
