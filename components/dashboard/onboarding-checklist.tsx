"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Circle,
  MessagesSquare,
  Rocket,
  Target,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingState {
  steps: {
    whatsappConnected: boolean;
    calendarReady: boolean;
    firstPropertyOrDocument: boolean;
    firstMatchFound: boolean;
  };
  completed: number;
  total: number;
  isComplete: boolean;
}

const DISMISS_KEY = "pt-onboarding-dismissed";

/**
 * I passaggi sono ordinati come il lavoro di un agente, non come i moduli del
 * software: prima far entrare le notizie, poi riempire il portafoglio, infine
 * vedere l'AI accoppiare le due cose. L'ultimo passaggio non si "esegue": si
 * completa da solo quando i primi due hanno prodotto abbastanza dati, ed è il
 * momento in cui si capisce a cosa serve lo strumento.
 */
const STEP_META = [
  {
    key: "whatsappConnected" as const,
    label: "Collega WhatsApp e fai entrare le notizie",
    hint: "I contatti dai portali arrivano già qualificati: mutuo, tempistiche, vincoli",
    href: "/leads",
    cta: "Collega",
    icon: MessagesSquare,
  },
  {
    key: "calendarReady" as const,
    label: "Apri l'agenda alle visite",
    hint: "Senza slot liberi l'assistente non può fissare appuntamenti da solo",
    href: "/settings/calendar",
    cta: "Aggiungi slot",
    icon: CalendarDays,
  },
  {
    key: "firstPropertyOrDocument" as const,
    label: "Carica il primo immobile o una visura",
    hint: "Dall'annuncio o dal PDF: in pochi secondi hai la scheda pronta per l'acquisizione",
    href: "/social",
    cta: "Inizia",
    icon: Building2,
  },
  {
    key: "firstMatchFound" as const,
    label: "Scopri i Match Perfetti",
    hint: "Registra le preferenze di un lead qualificato e l'AI trova chi comprerebbe cosa",
    href: "/properties",
    cta: "Guarda",
    icon: Target,
  },
];

export function OnboardingChecklist() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "true");

    fetch("/api/onboarding")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: OnboardingState | null) => data && setState(data))
      .catch(() => {
        // La checklist è un aiuto, non un requisito: se la fetch fallisce
        // la dashboard resta comunque utilizzabile.
      });
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
  }

  // A setup completato il widget sparisce da solo: non serve che l'agente lo chiuda.
  if (!state || dismissed || state.isComplete) return null;

  const progress = (state.completed / state.total) * 100;

  return (
    <section className="card-surface overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Rocket className="h-4 w-4 text-primary" />
            Primi passi: dal contatto al Match Perfetto
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tre minuti per vedere PropertyTech al lavoro sulla tua agenzia, usando i crediti
            gratuiti del piano Trial.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Nascondi la guida introduttiva"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-5">
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand-gradient transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {state.completed}/{state.total}
          </span>
        </div>
      </div>

      <ol className="mt-4 divide-y divide-border border-t border-border">
        {STEP_META.map((step) => {
          const done = state.steps[step.key];
          const Icon = step.icon;

          return (
            <li
              key={step.key}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                {done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-status-qualified" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" />
                )}
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      done ? "text-muted-foreground line-through" : "text-foreground"
                    )}
                  >
                    {step.label}
                  </p>
                  {!done && <p className="truncate text-xs text-muted-foreground">{step.hint}</p>}
                </div>
              </div>

              {!done && (
                <Link
                  href={step.href}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {step.cta}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
