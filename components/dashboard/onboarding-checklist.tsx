"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  FileSearch2,
  Gift,
  Lock,
  MessagesSquare,
  Mic,
  Rocket,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingState {
  steps: {
    prerequisiteReady: boolean;
    firstDocumentOrAppraisal: boolean;
    firstSocialGenerated: boolean;
    firstVoiceReport: boolean;
  };
  isEnterprise: boolean;
  completed: number;
  total: number;
  isComplete: boolean;
  bonusJustGranted: boolean;
}

const DISMISS_KEY = "pt-onboarding-dismissed";

/**
 * Un passaggio per ciascuno dei quattro moduli AI, non più il funnel del solo
 * Modulo 1 (lead → match). Un'agenzia che ha visto funzionare solo WhatsApp
 * non sa che il resto esiste — ed è quello che decide se un Trial diventa un
 * abbonamento.
 *
 * `altHref`/`altCta` coprono i passaggi con due strade equivalenti (il
 * prerequisito è WhatsApp O agenda, il documento è una perizia O una visura):
 * un solo pulsante grande per l'azione più probabile, un link piccolo accanto
 * per l'alternativa — non due pulsanti dello stesso peso, che farebbero
 * sembrare la riga doppia.
 */
const STEP_META = [
  {
    key: "prerequisiteReady" as const,
    label: "Collega WhatsApp o apri l'agenda",
    hint: "Serve almeno uno dei due prima che l'assistente possa qualificare un contatto e fissare una visita",
    href: "/leads",
    cta: "Collega WhatsApp",
    altHref: "/settings/calendar",
    altCta: "oppure apri l'agenda",
    icon: MessagesSquare,
  },
  {
    key: "firstDocumentOrAppraisal" as const,
    label: "Carica la tua prima perizia d'asta o un documento",
    hint: "Trascina il PDF: in pochi secondi hai stato occupazionale, difformità e costi di sanatoria, oppure i dati di una visura già strutturati",
    href: "/radar?nuovo=perizia",
    cta: "Carica una perizia",
    altHref: "/documents",
    altCta: "oppure una visura",
    icon: FileSearch2,
  },
  {
    key: "firstSocialGenerated" as const,
    label: "Genera il tuo primo annuncio o post social",
    hint: "Da un link, da un immobile già in portafoglio o da zero: testo per i portali e post per Facebook e Instagram in un clic",
    href: "/social?fonte=esistente",
    cta: "Genera un annuncio",
    icon: Sparkles,
  },
  {
    key: "firstVoiceReport" as const,
    label: "Prova il Report Venditore da nota vocale",
    hint: "Registri o scrivi la nota dopo una visita, l'AI genera il report da mandare al proprietario",
    href: "/voice-reports",
    cta: "Prova il report",
    icon: Mic,
  },
];

export function OnboardingChecklist() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [celebrazione, setCelebrazione] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "true");

    fetch("/api/onboarding")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: OnboardingState | null) => {
        if (!data) return;
        setState(data);
        // Il bonus lo assegna il server una volta sola (guardia sul database);
        // qui si mostra solo se questa è la lettura che l'ha appena scoperto.
        if (data.bonusJustGranted) setCelebrazione(true);
      })
      .catch(() => {
        // La checklist è un aiuto, non un requisito: se la fetch fallisce
        // la dashboard resta comunque utilizzabile.
      });
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
  }

  return (
    <>
      {celebrazione && <CelebrazioneModal onClose={() => setCelebrazione(false)} />}

      {(() => {
        // A setup completato il widget sparisce da solo: non serve che
        // l'agente lo chiuda. Ma non prima di aver mostrato la modale sopra,
        // che vive fuori da questo `if` apposta.
        if (!state || dismissed || state.isComplete) return null;

        const progress = (state.completed / state.total) * 100;

        return (
          <section className="card-surface overflow-hidden">
            <div className="flex items-start justify-between gap-3 p-5 pb-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Rocket className="h-4 w-4 text-primary" />
                  Primi passi con PropertyTech
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Quattro moduli, quattro minuti: prova ciascuno con i crediti gratuiti del Trial e
                  scopri cosa fa davvero l&apos;AI sulla tua agenzia.
                </p>
              </div>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Nascondi la guida introduttiva"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground sm:h-8 sm:w-8 transition-all duration-200 hover:bg-muted hover:text-foreground"
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
                /*
                 * Lo step delle Note Vocali non conta fuori da Enterprise
                 * (`state.total` è già 3 in quel caso: il server ha tolto
                 * questa riga dal conteggio, non solo dalla vista). Resta
                 * visibile come anteprima di cosa sblocca il piano superiore,
                 * ma con un trattamento diverso: nessuna spunta possibile,
                 * un lucchetto al posto del cerchio vuoto.
                 */
                const isVoiceStep = step.key === "firstVoiceReport";
                const nonIncluso = isVoiceStep && !state.isEnterprise;

                return (
                  <li
                    key={step.key}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-3 px-5 py-3",
                      nonIncluso && "bg-muted/20"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {done ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-status-qualified" />
                      ) : nonIncluso ? (
                        <Lock className="h-5 w-5 shrink-0 text-muted-foreground/40" />
                      ) : (
                        <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" />
                      )}
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "flex flex-wrap items-center gap-1.5 text-sm font-medium",
                            done ? "text-muted-foreground line-through" : "text-foreground"
                          )}
                        >
                          {step.label}
                          {nonIncluso && (
                            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                              Enterprise
                            </span>
                          )}
                        </p>
                        {!done && <p className="truncate text-xs text-muted-foreground">{step.hint}</p>}
                      </div>
                    </div>

                    {!done && (
                      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
                        <Link
                          href={step.href}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted"
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {nonIncluso ? "Scopri come funziona" : step.cta}
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                        {step.altHref && (
                          <Link
                            href={step.altHref}
                            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          >
                            {step.altCta}
                          </Link>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })()}
    </>
  );
}

/**
 * La ricompensa è vera, non solo scritta: il server ha già sommato 5
 * conversazioni al limite del piano prima che questa modale compaia. È anche
 * il motivo per cui è chiudibile in ogni modo — Escape, clic fuori, la X —
 * al contrario del modale dei limiti di piano: quello blocca un'azione,
 * questo festeggia un traguardo già raggiunto.
 */
function CelebrazioneModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-celebrazione-titolo"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
    >
      <div
        role="document"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-lg"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Gift className="h-6 w-6" />
        </div>
        <h2 id="onboarding-celebrazione-titolo" className="mt-4 text-lg font-semibold text-foreground">
          Hai provato tutti i moduli
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Hai visto WhatsApp, l&apos;estrazione documenti, il Social Multiplier e cosa può fare
          l&apos;AI sulla tua agenzia. Come ringraziamento, il tuo piano ha{" "}
          <strong className="text-foreground">5 conversazioni WhatsApp in più</strong> ogni mese, già
          attive.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="btn-brand mt-5 w-full justify-center"
        >
          Continua
        </button>
      </div>
    </div>
  );
}
