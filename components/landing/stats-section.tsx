"use client";

import { useEffect, useRef, useState } from "react";
import { formatCount, PLANS } from "@/lib/plans";
import { Reveal } from "./reveal";

/**
 * Numeri della piattaforma.
 *
 * Sono tutti **fatti verificabili sul prodotto** — orari di servizio, formati
 * generati, limiti di piano, regione di elaborazione — e non promesse di
 * risultato tipo "+90% di efficienza". PropertyTech non ha ancora una base
 * clienti da cui ricavare percentuali di quel tipo: pubblicarle sarebbe una
 * dichiarazione non sostenibile, oltre che pubblicità ingannevole verso
 * un'agenzia che decide se abbonarsi.
 */

interface Stat {
  /** Valore finale mostrato. */
  display: string;
  /** Se numerico, il conteggio parte da zero e sale fino a questo valore. */
  countTo?: number;
  /** Testo che precede e segue il numero durante il conteggio. */
  prefix?: string;
  suffix?: string;
  label: string;
  detail: string;
}

const STATS: Stat[] = [
  {
    display: "24/7",
    label: "Sempre attivo",
    detail: "Risponde alle notizie dai portali anche di notte, nei weekend e in agosto",
  },
  {
    display: "3",
    countTo: 3,
    label: "Formati per incarico",
    detail: "Annuncio per i portali, post social e script del Reel da un solo inserimento",
  },
  {
    display: formatCount(PLANS.enterprise.waConversationsLimit),
    countTo: PLANS.enterprise.waConversationsLimit,
    label: "Notizie al mese",
    detail: `Conversazioni WhatsApp qualificate incluse nel piano ${PLANS.enterprise.name}`,
  },
  {
    display: "100%",
    countTo: 100,
    suffix: "%",
    label: "Dati in Europa",
    detail: "Database a Francoforte ed elaborazione in UE, come impone il GDPR",
  },
];

/** Durata del conteggio: oltre si percepisce come lentezza, non come effetto. */
const COUNT_MS = 1100;

function AnimatedNumber({ stat }: { stat: Stat }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState<string>(stat.display);

  useEffect(() => {
    const node = ref.current;
    if (!node || stat.countTo === undefined) return;

    // Chi ha chiesto meno movimento vede solo il numero finale.
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") return;

    const target = stat.countTo;
    let frame = 0;
    let start = 0;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.disconnect();

          const step = (now: number) => {
            if (!start) start = now;
            const progress = Math.min((now - start) / COUNT_MS, 1);
            // Decelerazione: il numero rallenta avvicinandosi al valore reale.
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(target * eased);

            setValue(`${stat.prefix ?? ""}${formatCount(current)}${stat.suffix ?? ""}`);

            if (progress < 1) frame = requestAnimationFrame(step);
            // A conteggio finito si ripristina la stringa dichiarata, che è
            // l'unica fonte di verità del valore mostrato.
            else setValue(stat.display);
          };

          frame = requestAnimationFrame(step);
        }
      },
      { threshold: 0.4 }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [stat]);

  return (
    <span ref={ref} className="tabular-nums">
      {value}
    </span>
  );
}

export function StatsSection() {
  return (
    <section className="border-t border-border py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-primary">
            PropertyTech in numeri
          </p>
        </Reveal>

        <dl className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((stat, index) => (
            <Reveal key={stat.label} delayMs={index * 90}>
              <div className="text-center">
                <dd className="bg-brand-gradient bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
                  <AnimatedNumber stat={stat} />
                </dd>
                <dt className="mt-3 text-xs font-semibold uppercase tracking-widest text-foreground">
                  {stat.label}
                </dt>
                <p className="mx-auto mt-2 max-w-[15rem] text-sm text-muted-foreground">
                  {stat.detail}
                </p>
              </div>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
