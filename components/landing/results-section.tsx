import {
  CalendarCheck,
  FileSearch2,
  FileSignature,
  MessagesSquare,
  Mic,
  Share2,
} from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { SectionHeading } from "@/components/landing/section-heading";

/**
 * "Cosa ottieni": i risultati concreti dell'uso quotidiano.
 *
 * # Perché una sezione a sé, dopo i moduli
 *
 * I quattro pilastri rispondono a "cosa fa il software". Chi valuta un
 * abbonamento si fa però una domanda diversa e successiva — "e io cosa mi
 * ritrovo in mano?" — e finora la pagina la lasciava dedurre. Dedurre un
 * beneficio da un elenco di funzioni è lavoro che il lettore non fa: chiude
 * la pagina.
 *
 * # Il vincolo sul contenuto
 *
 * Nessuna percentuale inventata. Vale qui la stessa regola della sezione dei
 * numeri: senza una base clienti da cui ricavarle, "+40% di appuntamenti"
 * sarebbe una dichiarazione non sostenibile verso un'agenzia che decide se
 * pagare — pubblicità ingannevole, non marketing aggressivo.
 *
 * Ogni voce dichiara quindi **una cosa che il software consegna davvero** e la
 * conseguenza diretta sul lavoro dell'agente, senza quantificarne l'esito
 * commerciale. La nota di chiusura lo dice esplicitamente, perché un lettore
 * che si aspetta numeri deve sapere perché non li trova.
 *
 * Le due voci riservate all'Enterprise portano l'etichetta del piano: un
 * risultato promesso qui e poi non disponibile nel piano acquistato è la
 * forma peggiore di delusione, quella che si scopre dopo aver pagato.
 */

interface Risultato {
  icon: typeof MessagesSquare;
  title: string;
  body: string;
  /** Piano che sblocca il risultato, dove non è incluso ovunque. */
  plan?: string;
}

const RISULTATI: Risultato[] = [
  {
    icon: MessagesSquare,
    title: "Nessuna richiesta persa per un ritardo",
    body: "Ogni contatto che arriva dai portali riceve risposta in pochi secondi, anche alle undici di sera e a Ferragosto. Chi ti scrive non fa in tempo a contattare l'agenzia dopo la tua.",
  },
  {
    icon: CalendarCheck,
    title: "In agenda solo visite che possono chiudersi",
    body: "L'appuntamento viene proposto dopo aver verificato capienza economica, tempi d'acquisto ed eventuale casa da vendere prima. Il sabato mattina torna a essere una trattativa.",
  },
  {
    icon: FileSearch2,
    title: "Pratiche pronte senza ricopiare un dato",
    body: "Foglio, particella, subalterno, rendita e intestatari escono in chiaro dal PDF, con le difformità e i documenti mancanti segnalati. Le ore che oggi passano in visure tornano disponibili.",
  },
  {
    icon: FileSignature,
    title: "Più mandati, non solo più acquirenti",
    body: "Chi ti scrive per comprare spesso ha una casa da vendere: emerge dalla stessa conversazione e te lo ritrovi segnalato nel pannello. Fissi la valutazione prima delle altre agenzie.",
  },
  {
    icon: Share2,
    title: "L'immobile online il giorno dell'incarico",
    body: "Da quattro righe di appunti ottieni il testo per i portali, il post per Instagram e Facebook e lo script del Reel. La pubblicazione non aspetta più la sera o il fine settimana.",
    plan: "Piano Enterprise",
  },
  {
    icon: Mic,
    title: "Proprietari che rinnovano il mandato",
    body: "Dopo ogni visita il proprietario riceve un report scritto, ricavato da trenta secondi di nota vocale. Vede che qualcuno sta lavorando davvero sul suo immobile.",
    plan: "Piano Enterprise",
  },
];

export function ResultsSection() {
  return (
    <section id="risultati" className="scroll-mt-20 border-t border-border py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Risultati"
          title="Che cosa ti ritrovi in mano dalla prima settimana"
          width="wide"
          subtitle="Sei cose che prima richiedevano il tuo tempo e da oggi ti arrivano già fatte."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RISULTATI.map((risultato, index) => {
            const Icon = risultato.icon;
            return (
              <Reveal key={risultato.title} delayMs={index * 70} className="flex">
                <div className="flex w-full flex-col rounded-xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-sm">
                      <Icon className="h-5 w-5" />
                    </span>
                    {risultato.plan && (
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                        {risultato.plan}
                      </span>
                    )}
                  </div>

                  <h3 className="mt-4 text-base font-semibold text-foreground">
                    {risultato.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {risultato.body}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>

        {/* La riga che spiega perché qui non ci sono percentuali. Dichiararlo
            vale più di un numero gonfiato: l'agente che ha già visto tre
            fornitori promettere "+30% di fatturato" riconosce la differenza. */}
        <p className="mx-auto mt-10 max-w-3xl text-center text-sm leading-relaxed text-muted-foreground">
          Quante trattative ne nascano dipende dal tuo mercato e da quanti contatti ricevi, e nessun
          software può prometterlo. Quello che PropertyTech garantisce è il lavoro svolto: risposta
          immediata a ogni richiesta, qualifica prima dell&apos;appuntamento, documenti letti e
          contenuti pronti.
        </p>
      </div>
    </section>
  );
}
