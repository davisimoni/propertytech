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
    title: "Colleghi il numero WhatsApp dell'agenzia",
    action:
      "Inquadri un codice QR dalla schermata Qualifica Lead, come fai con WhatsApp Web. Poi apri l'agenda alle fasce in cui fai vedere gli immobili.",
    outcome:
      "Da quel momento ogni notizia che arriva dai portali entra in piattaforma, giorno e notte, festivi compresi.",
  },
  {
    number: "2",
    icon: Target,
    duration: "da lì in poi, da sola",
    title: "L'assistente qualifica, fissa e propone",
    action:
      "Carichi gli incarichi: trascini il PDF di una visura o incolli il link di un annuncio già online. Bastano quattro righe se parti da zero.",
    outcome:
      "Chi scrive riceve risposta in pochi secondi e viene qualificato su mutuo, vendita da fare prima e tempistiche, poi si vede proporre i tuoi orari liberi. Nel frattempo la piattaforma incrocia quel contatto con tutto il tuo portafoglio e ti manda gli immobili che gli somigliano.",
  },
  {
    number: "3",
    icon: Building2,
    duration: "il tempo che resta",
    title: "Tu fai le visite e chiudi",
    action:
      "Ricevi in agenda solo appuntamenti con persone qualificate. Dopo la visita racconti a voce com'è andata, trenta secondi.",
    outcome:
      "Il proprietario riceve il report che fa rinnovare il mandato, i promemoria evitano i mancati arrivi, e gli incarichi in scadenza te li ricorda la piattaforma. Restano quindici ore a settimana che prima passavi a filtrare curiosi.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="come-funziona" className="scroll-mt-20 border-t border-border py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <Reveal>
          <SectionHeading
            eyebrow="Come funziona"
            title="Dalla registrazione al primo appuntamento in agenda"
            subtitle="Quattro passaggi, meno di dieci minuti in tutto. Non serve installare niente, né cambiare il gestionale che usi già."
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
