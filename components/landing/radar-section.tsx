import { Calculator, MapPinned, ScanSearch, Send } from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";
import { Reveal } from "./reveal";

/**
 * Il modulo Radar sulla landing.
 *
 * # Perché ha una sezione sua e non una card fra i moduli
 *
 * È l'unica cosa che il prodotto fa e che i concorrenti non fanno. Gli altri
 * moduli tolgono lavoro; questo apre un mercato — le aste — che la maggior
 * parte delle agenzie oggi lascia stare perché leggere sessanta pagine di
 * perizia costa un pomeriggio. Metterlo in fila agli altri lo farebbe leggere
 * come una funzione fra tante.
 *
 * # Cosa NON promette
 *
 * Non dice "zero rischi", che su un lotto all'asta nessuno può promettere: il
 * semaforo è una lettura della perizia, non una garanzia sull'immobile. E non
 * dice che il modulo trova le aste da solo, perché oggi i lotti si inseriscono
 * a mano. Scriverlo altrimenti sarebbe la prima cosa che un'agenzia scopre
 * dopo aver pagato.
 */

const PUNTI = [
  {
    icon: ScanSearch,
    title: "Sintesi delle perizie e semaforo di rischio",
    body: "Carichi il PDF della perizia e in pochi secondi hai stato occupazionale, difformità edilizie, vincoli e costo stimato di sanatoria. Il semaforo verde, giallo o rosso non è un parere dell'AI: lo calcola il software con criteri dichiarati, che vedi scritti accanto al colore.",
  },
  {
    icon: Calculator,
    title: "Simulatore economico per gli investitori",
    body: "Capitale complessivo, margine sulla rivendita e rendimento lordo da locazione, calcolati sui tuoi numeri e correggibili riga per riga. Il prospetto parte su WhatsApp con un clic, e dichiara di essere lordo invece di lasciarlo intuire.",
  },
  {
    icon: Send,
    title: "Incrocio con i tuoi clienti in banca dati",
    body: "Ogni lotto viene confrontato con le richieste dei contatti che hai già qualificato. Quando un'asta ribassa, chi prima era fuori budget ci rientra e te lo dice. La proposta parte solo se la approvi tu: nessun invio automatico, nessun rischio per il tuo numero.",
  },
  {
    icon: MapPinned,
    title: "Mappa delle occasioni e della domanda",
    body: "I lotti sulla mappa, colorati per rischio e raggruppati per non sovrapporsi. Sopra puoi accendere le zone più cercate dai tuoi lead: dove uno sconto forte incontra molti clienti in attesa, si vede a colpo d'occhio.",
  },
];

export function RadarSection() {
  return (
    <section id="radar" className="scroll-mt-20 border-t border-border bg-muted/30 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Radar Aste"
          width="wide"
          title="Il primo radar aste e ribassi potenziato dall'intelligenza artificiale"
          subtitle="Trasforma una perizia da sessanta pagine in un'analisi di rischio leggibile, calcola il rendimento per un investitore e scopri subito quali dei tuoi clienti sono già pronti a comprare."
        />

        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          {PUNTI.map((punto, index) => {
            const Icon = punto.icon;
            return (
              <Reveal key={punto.title} delayMs={index * 80} className="flex">
                <div className="flex w-full flex-col rounded-xl border border-border bg-card p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-sm">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-foreground">{punto.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{punto.body}</p>
                </div>
              </Reveal>
            );
          })}
        </div>

        {/*
          Detto qui e non nascosto in una nota: il modulo legge le perizie, non
          cerca le aste. Un'agenzia che scopre dopo l'abbonamento che i lotti si
          inseriscono a mano disdice, e ha ragione.
        */}
        <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-relaxed text-muted-foreground">
          I lotti si inseriscono dal pannello, uno alla volta o dal link dell&apos;annuncio: il
          Radar analizza le perizie e incrocia i tuoi clienti, non sostituisce i portali delle
          vendite giudiziarie. Le sintesi sono prodotte automaticamente a supporto della tua
          valutazione e non sostituiscono l&apos;esame dei documenti.
        </p>
      </div>
    </section>
  );
}
