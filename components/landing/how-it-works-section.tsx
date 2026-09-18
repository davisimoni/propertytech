import Link from "next/link";
import { ArrowRight, Building2, MessagesSquare, Target } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { SectionHeading } from "@/components/landing/section-heading";

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
    title: "Colleghi i portali e WhatsApp",
    action:
      "Inquadri un codice col telefono, come fai con WhatsApp Web, e dai al portale l'indirizzo che trovi in schermata. Non serve nessuna competenza tecnica, e il gestionale che usi resta dov'è.",
    outcome:
      "Da quel momento ogni richiesta che arriva da Immobiliare.it, Idealista e Casa.it entra in agenzia, giorno e notte, festivi compresi.",
  },
  {
    number: "2",
    icon: Target,
    duration: "da lì in poi, da sola",
    title: "L'assistente qualifica ogni richiesta su WhatsApp, 24 ore su 24",
    action:
      "Apri l'agenda alle fasce in cui fai vedere gli immobili. Il resto lo fa l'assistente.",
    outcome:
      "Scrive al cliente in pochi secondi, filtra i curiosi, chiede il budget, controlla le tempistiche e propone i tuoi orari liberi. Il promemoria prima della visita riduce i mancati arrivi.",
  },
  {
    number: "3",
    icon: Building2,
    duration: "il tempo che resta",
    title: "Documenti, annunci e social da un'unica schermata",
    action:
      "Trascini la visura o l'atto e carichi l'incarico. Dopo la visita racconti a voce com'è andata, trenta secondi.",
    outcome:
      "I dati catastali escono già in chiaro, l'annuncio e i post per Facebook e Instagram sono pronti da pubblicare, e il proprietario riceve il report che fa rinnovare il mandato.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="come-funziona" className="scroll-mt-20 border-t border-border py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <Reveal>
          <SectionHeading
            eyebrow="Come funziona nel concreto"
            title="Dalla registrazione al primo appuntamento in agenda"
            subtitle="Tre passaggi, meno di dieci minuti in tutto. Non serve installare niente, né cambiare il gestionale che usi già."
          />
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
