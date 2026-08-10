import Link from "next/link";
import { ArrowRight, Building2, CalendarCheck, MessagesSquare, Target } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";

/**
 * "Come funziona": i quattro passaggi dall'iscrizione al primo risultato.
 *
 * Ogni passo dichiara **cosa fa l'agente** e **cosa riceve in cambio**: un
 * elenco di funzionalità non risponde alla domanda che si fa chi valuta un
 * gestionale, cioè "quanto lavoro devo mettere prima di vedere qualcosa".
 * I tempi indicati sono quelli reali della configurazione, non promesse.
 */

interface Step {
  number: string;
  icon: typeof MessagesSquare;
  duration: string;
  title: string;
  /** Cosa deve fare concretamente l'agente. */
  action: string;
  /** Cosa succede dopo, senza che debba fare altro. */
  outcome: string;
}

const STEPS: Step[] = [
  {
    number: "1",
    icon: MessagesSquare,
    duration: "2 minuti",
    title: "Colleghi il numero WhatsApp dell'agenzia",
    action:
      "Ti registri e incolli le credenziali WhatsApp Business dalla schermata Qualifica Lead. Copi l'indirizzo che ti diamo e lo consegni a Immobiliare.it, Idealista o al tuo gestionale.",
    outcome:
      "Da quel momento ogni notizia che arriva dai portali entra in piattaforma, giorno e notte.",
  },
  {
    number: "2",
    icon: CalendarCheck,
    duration: "5 minuti",
    title: "Apri l'agenda alle visite",
    action:
      "Indichi le fasce in cui sei disponibile per far vedere gli immobili. Puoi cambiarle quando vuoi.",
    outcome:
      "L'assistente risponde al contatto in pochi secondi, capisce se ha il mutuo, se deve vendere prima e in quanto tempo vuole chiudere, poi gli propone i tuoi orari liberi e fissa l'appuntamento. Ti arriva già in agenda.",
  },
  {
    number: "3",
    icon: Building2,
    duration: "1 minuto a immobile",
    title: "Carichi gli incarichi e le visure",
    action:
      "Trascini il PDF della visura o incolli il link di un annuncio già online. Se parti da zero, bastano quattro righe sull'immobile.",
    outcome:
      "Ottieni intestatari, quote e dati catastali in chiaro, il testo per i portali, il post social, lo script del Reel e il feed XML da caricare. L'immobile entra nel tuo portafoglio.",
  },
  {
    number: "4",
    icon: Target,
    duration: "automatico",
    title: "L'AI abbina, tu chiudi",
    action:
      "Registri in scheda le preferenze dei clienti che segui: zona, budget, tipologia, metratura minima.",
    outcome:
      "Ogni volta che entra un immobile, la piattaforma ti dice quali clienti in archivio potrebbero comprarlo e perché. Dopo ogni visita racconti a voce com'è andata e il proprietario riceve il report.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="come-funziona" className="scroll-mt-20 border-t border-border py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">
              Come funziona
            </span>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Dalla registrazione al primo appuntamento in agenda
            </h2>
            <p className="mt-3 text-muted-foreground">
              Quattro passaggi, meno di dieci minuti in tutto. Non serve installare niente, né
              cambiare il gestionale che usi già.
            </p>
          </div>
        </Reveal>

        <ol className="mt-12 space-y-4">
          {STEPS.map((step, index) => {
            const Icon = step.icon;

            return (
              <Reveal key={step.number} delayMs={index * 80}>
                <li className="relative flex flex-col gap-4 rounded-xl border border-border bg-card p-6 sm:flex-row sm:gap-6">
                  <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:gap-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-sm">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-2xl font-bold text-muted-foreground/25 sm:text-3xl">
                      {step.number}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-foreground">{step.title}</h3>
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                        {step.duration}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-muted-foreground">{step.action}</p>

                    {/* Il risultato è visivamente staccato dall'azione: è la
                        parte che interessa davvero a chi sta valutando. */}
                    <p className="mt-3 border-l-2 border-status-qualified/40 pl-3 text-sm text-foreground">
                      {step.outcome}
                    </p>
                  </div>
                </li>
              </Reveal>
            );
          })}
        </ol>

        <Reveal delayMs={120}>
          <div className="mt-10 text-center">
            <Link href="/register" className="btn-brand">
              Inizia adesso, è gratis
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-3 text-xs text-muted-foreground">
              15 notizie qualificate incluse · Nessuna carta di credito · Disdici quando vuoi
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
