import Link from "next/link";
import {
  ArrowRight,
  Check,
  FileSearch2,
  FileSignature,
  MessagesSquare,
  Mic,
  MoonStar,
  Radar,
  Share2,
  ShieldCheck,
  Sparkles,
  UserX,
  X,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Reveal } from "@/components/landing/reveal";
import { SectionHeading } from "@/components/landing/section-heading";

/* ─────────────────────────── 1. Hero ─────────────────────────── */

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-56 left-1/2 h-[30rem] w-[52rem] -translate-x-1/2 rounded-full bg-brand-gradient opacity-[0.09] blur-3xl"
      />

      {/* Entrata in dissolvenza al caricamento, non allo scorrimento: l'hero è
          già sullo schermo. Si spegne con prefers-reduced-motion. */}
      <div className="animate-rise-in relative mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Creato per le agenzie immobiliari italiane
        </span>

        <h1 className="mt-6 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">
          La piattaforma AI che qualifica i lead WhatsApp
          <span className="bg-brand-gradient bg-clip-text text-transparent"> 24 ore su 24</span> e
          trasforma le visure in schede immobile
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Ogni richiesta da Immobiliare.it, Idealista e Casa.it riceve risposta in pochi secondi e
          ti torna con mutuo, tempistiche e vincoli già verificati, pronta da inoltrare al tuo
          gestionale. Le visure diventano dati catastali in chiaro e ogni acquirente viene
          incrociato con il tuo portafoglio.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/register"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-gradient px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:shadow-lg hover:brightness-110 sm:w-auto"
          >
            Attiva la prova gratuita
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="#come-funziona"
            className="inline-flex w-full items-center justify-center rounded-xl border border-border px-6 py-3 text-sm font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted sm:w-auto"
          >
            Vedi come funziona
          </Link>
        </div>

        {/* Le tre obiezioni che fermano un agente prima di cliccare: quanto mi
            costa, quanto tempo mi ruba, dove finiscono i dati dei miei clienti. */}
        <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          {["Nessuna carta di credito", "Attivo in 2 minuti", "Conforme al GDPR, server in UE"].map(
            (item) => (
              <li key={item} className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 shrink-0 text-status-qualified" aria-hidden="true" />
                {item}
              </li>
            )
          )}
        </ul>
      </div>
    </section>
  );
}

/* ─────────────────── 2. Prima e dopo ─────────────────── */

/**
 * Il confronto fra la giornata di oggi e quella con la piattaforma attiva.
 *
 * # Perché appaiate e non due elenchi separati
 *
 * Un elenco di problemi e, più sotto, un elenco di funzioni obbligano il
 * lettore a tenere a mente il primo mentre legge il secondo, per capire quale
 * risposta corrisponde a quale problema. Sulla stessa riga il collegamento è
 * già fatto, e l'agente riconosce la propria giornata prima di leggere cosa
 * gli si propone.
 */
const BEFORE_AFTER = [
  {
    icon: MoonStar,
    topic: "Le richieste dai portali",
    before:
      "Arrivano dopo cena e nel weekend su Immobiliare.it e Idealista. Lunedì richiami e l'acquirente ha già visitato con un'altra agenzia.",
    after:
      "Ricevono risposta in pochi secondi a qualsiasi ora, anche mentre sei in visita. Il contatto resta caldo finché non lo prendi in mano tu.",
  },
  {
    icon: UserX,
    topic: "Gli appuntamenti",
    before:
      "Visite fissate al buio con chi non ha capienza economica né una tempistica. Un sabato mattina speso con chi stava solo guardando.",
    after:
      "L'assistente verifica mutuo, immobile da vendere prima di comprare e tempi d'acquisto prima di proporre un orario della tua agenda.",
  },
  {
    icon: FileSearch2,
    topic: "Visure e portafoglio",
    before:
      "Foglio, particella, subalterno e rendita ricopiati a mano da PDF scansionati male. Gli acquirenti in archivio nessuno li rilegge.",
    after:
      "Carichi il PDF e ricevi i dati catastali in chiaro. Ogni acquirente viene incrociato con il portafoglio: ti arrivano solo gli abbinamenti sopra l'80%.",
  },
];

export function ProblemSection() {
  return (
    <section className="border-t border-border bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Prima e dopo"
          title="La stessa giornata, con e senza assistente"
          subtitle="Tre attività che oggi occupano le ore in cui potresti acquisire mandati."
        />

        {/* Intestazioni di colonna solo da tablet in su: sul telefono le due
            metà sono impilate e portano già la propria etichetta, quindi una
            riga di intestazione descriverebbe colonne che lì non esistono. */}
        <div className="mt-12 hidden gap-4 md:grid md:grid-cols-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-status-blocked">
            Oggi
          </p>
          <p className="text-xs font-semibold uppercase tracking-widest text-status-qualified">
            Con PropertyTech
          </p>
        </div>

        <div className="mt-4 space-y-4">
          {BEFORE_AFTER.map((riga, index) => {
            const Icon = riga.icon;
            return (
              <Reveal key={riga.topic} delayMs={index * 80}>
                <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-semibold text-foreground">{riga.topic}</h3>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-status-blocked/35 bg-status-blocked/10 p-3.5">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-status-blocked md:hidden">
                        <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Oggi
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground md:mt-0">
                        {riga.before}
                      </p>
                    </div>

                    {/* La meta' "dopo" e' quella che deve saltare all'occhio: bordo
                        pieno e alone, contro il riquadro spento del "prima".
                        Su telefono le due card sono impilate e si leggono una
                        dopo l'altra, quindi il contrasto e' l'unica cosa che
                        dice quale delle due e' la situazione desiderabile. */}
                    <div className="rounded-lg border border-status-qualified bg-status-qualified/10 p-3.5 shadow-sm ring-1 ring-status-qualified/20">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-status-qualified md:hidden">
                        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Con PropertyTech
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-foreground md:mt-0">
                        {riga.after}
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── 3. I quattro pilastri ─────────────────── */

/**
 * I quattro moduli su cui si regge la giornata dell'agente.
 *
 * Sono quattro e non sei perché una pagina che presenta ogni funzione con lo
 * stesso peso non ne fa ricordare nessuna. Gli altri due moduli restano più
 * sotto, in forma compatta: il listino li vende — il Social Multiplier è una
 * riga del piano Enterprise — e una funzione che compare nel prezzo senza
 * essere spiegata da nessuna parte è una domanda in più prima di comprare.
 */
interface Pillar {
  number: string;
  slug: string;
  icon: typeof MessagesSquare;
  title: string;
  tag: string;
  body: string;
  points: string[];
  /** Riga in evidenza sotto i punti: presente solo dove toglie un'obiezione. */
  highlight?: string;
}

const PILLARS: Pillar[] = [
  {
    number: "01",
    slug: "modulo-whatsapp",
    icon: MessagesSquare,
    title: "Qualifica su WhatsApp, 24 ore su 24",
    tag: "Sempre attiva",
    body: "Ogni richiesta da Immobiliare.it, Idealista e Casa.it riceve risposta in pochi secondi, anche di notte e la domenica. Prima di proporre una visita l'assistente verifica la capienza finanziaria (mutuo deliberato o acquisto in liquidità), se c'è un immobile da vendere prima e in quanto tempo si vuole chiudere. In agenda entra solo chi può comprare davvero: i sabati non se li prende più chi stava guardando.",
    points: [
      "Capienza verificata prima della visita: mutuo deliberato o liquidità",
      "Tempistica d'acquisto e immobile da vendere prima di comprare",
      "Subentri tu con un clic: l'assistente si ferma su quella chat",
      "Appuntamento in agenda e lead inoltrato al tuo gestionale",
    ],
    highlight:
      "I tuoi lead restano tuoi: non devi cambiare gestionale né migrare i tuoi dati.",
  },
  {
    number: "02",
    slug: "modulo-visure",
    icon: FileSearch2,
    title: "Lettura di visure e atti",
    tag: "In pochi secondi",
    body: "Carichi il PDF della visura, della planimetria, dell'atto di provenienza o dell'APE e ricevi intestatari, quote di proprietà, foglio, particella, subalterno, categoria e rendita catastale già in chiaro, più due righe su cosa manca o non torna. Dieci pagine scansionate male diventano una scheda pronta per l'acquisizione.",
    points: [
      "Foglio, particella, subalterno, rendita e intestatari compilati",
      "Difformità e documenti mancanti segnalati subito",
      "Scheda in PDF con il tuo logo, pronta per il cliente",
    ],
  },
  {
    number: "03",
    slug: "modulo-matching",
    icon: Radar,
    title: "Matchmaking bidirezionale",
    tag: "In tempo reale",
    body: "Appena un contatto finisce di dire cosa cerca, la piattaforma passa in rassegna l'intero portafoglio dell'agenzia e ti segnala gli immobili che corrispondono davvero. Funziona anche al contrario: carichi una nuova acquisizione e scopri subito chi in archivio la stava aspettando.",
    points: [
      "Solo gli abbinamenti sopra l'80%: nessuna lista da spulciare",
      "Proponi l'immobile su WhatsApp con un tocco, testo già pronto",
      "Gli immobili senza incarico valido restano fuori dalle proposte",
    ],
  },
  {
    number: "04",
    slug: "modulo-report",
    icon: Mic,
    title: "Report vocali post-visita",
    tag: "Piano Enterprise",
    body: "Appena finita la visita detti una nota vocale di trenta secondi, come faresti con un collega. L'assistente la trascrive e ne ricava un report professionale per il proprietario, con i commenti dei visitatori riformulati in modo chiaro ma mai offensivo, pronto da mandare su WhatsApp.",
    points: [
      "Racconti la visita a voce, senza scrivere una riga",
      "Il proprietario vede che stai lavorando sul suo immobile",
      "È quello che fa rinnovare il mandato alla scadenza",
    ],
  },
];

/** Moduli inclusi nei piani ma non fra i pilastri: presentati in breve. */
const ALSO_INCLUDED = [
  {
    slug: "modulo-annunci",
    icon: Share2,
    title: "Annunci e social, tutti i canali insieme",
    body: "Quattro righe sull'immobile e ottieni il testo per i portali, il post per Instagram e Facebook e lo script del Reel. Con il feed XML pronto per il caricamento sui portali.",
  },
  {
    slug: "modulo-incarichi",
    icon: FileSignature,
    title: "Incarichi con avviso di scadenza",
    body: "Tipo di mandato, scadenza, provvigione concordata e ubicazione delle chiavi in scheda. Avviso via email a 60 e a 30 giorni, e un incarico scaduto esce da solo dai portali.",
  },
];

export function SolutionSection() {
  return (
    <section id="moduli" className="scroll-mt-20 border-t border-border bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          above={<LogoMark className="mx-auto h-12 w-12" gradientId="pt-solution" />}
          eyebrow="Funzioni chiave"
          title="Quattro pilastri operativi"
          subtitle="Ognuno si prende un compito che oggi ti ruba tempo e te lo restituisce già fatto."
        />

        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          {PILLARS.map((module, index) => {
            const Icon = module.icon;
            return (
              // Sfalsamento leggero fra le card: entrano in sequenza invece che
              // tutte insieme, così lo sguardo le legge una alla volta.
              <Reveal key={module.number} delayMs={index * 80} className="flex">
                {/* `scroll-mt-20` compensa la navbar fissa: senza, l'ancora
                    porta la card sotto l'intestazione. */}
                <div
                  id={module.slug}
                  className="flex w-full scroll-mt-20 flex-col rounded-xl border border-border bg-card p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-sm">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                        {module.tag}
                      </span>
                      <span className="text-2xl font-bold text-muted-foreground/25">
                        {module.number}
                      </span>
                    </div>
                  </div>

                  <h3 className="mt-4 text-base font-semibold text-foreground">{module.title}</h3>
                  {/*
                    Niente `flex-1` qui.
                    Con quello, il paragrafo si prendeva tutto lo spazio
                    avanzato nella card: la 02, non avendo il banner in fondo,
                    ne aveva di piu' e spingeva il proprio elenco piu' in basso
                    di quello della 01, a parita' di riga.

                    `lg:min-h` da' invece a tutti i paragrafi la stessa altezza
                    dove la griglia e' a due colonne, cosi' gli elenchi partono
                    dalla stessa quota. Sotto `lg` le card sono impilate e non
                    c'e' niente da allineare, quindi il vincolo non si applica
                    e non lascia spazio vuoto sul telefono. Il valore copre il
                    corpo piu' lungo (~6 righe a questa larghezza) con una riga
                    di margine: se un testo cresce oltre, la card si allunga da
                    se' — l'allineamento si perde, il testo non si taglia.
                  */}
                  <p className="mt-2 text-sm text-muted-foreground lg:min-h-[8.75rem]">
                    {module.body}
                  </p>

                  <ul className="mt-4 space-y-1.5">
                    {module.points.map((point) => (
                      <li key={point} className="flex items-center gap-2 text-sm text-foreground">
                        <Check className="h-4 w-4 shrink-0 text-status-qualified" />
                        {point}
                      </li>
                    ))}
                  </ul>

                  {module.highlight && (
                    <p className="mt-5 flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm font-medium text-foreground">
                      <ShieldCheck
                        className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      {module.highlight}
                    </p>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>

      </div>
    </section>
  );
}

/* ─────────────────── 4. Acquisizioni e moduli inclusi ─────────────────── */

/**
 * Il lato venditore, in una sezione propria.
 *
 * # Perché staccata dai quattro pilastri
 *
 * I pilastri rispondono alla domanda "cosa fa per i miei acquirenti". Questa
 * risponde a una domanda diversa — "cosa mi porta in acquisizione" — ed è
 * quella che per un titolare vale di più: un acquirente porta una provvigione,
 * un mandato ne porta una e apre il portafoglio.
 *
 * Tenerla in fondo alla sezione precedente la faceva leggere come una coda dei
 * moduli, cioè come la parte che si salta. Sfondo diverso da quello attenuato
 * dei pilastri e respiro verticale doppio: sono i due segnali che dicono
 * "questa è un'altra cosa" senza bisogno di un titolo che lo annunci.
 */
export function AcquisitionSection() {
  return (
    <section className="border-t border-border py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/*
          Intestazione standard, non una card.
          Questo non è un settimo modulo: è ciò che i quattro pilastri
          producono di riflesso, e per un titolare è la voce che pesa di più.
          Un acquirente porta una provvigione, un mandato ne porta una e apre
          il portafoglio. Presentarlo dentro un riquadro colorato lo faceva
          leggere come un richiamo promozionale, cioè come la parte da saltare.
        */}
        <SectionHeading
          eyebrow="Acquisizioni"
          title="Intercetta chi vuole valutare o vendere casa prima della concorrenza"
          width="wide"
          subtitle={
            <>
              Chi ti scrive per acquistare una casa ha spesso un immobile da vendere prima di poter
              comprare. L&apos;assistente virtuale lo individua subito durante la qualifica
              iniziale e lo contrassegna nel tuo pannello come{" "}
              <strong className="font-semibold text-foreground">Venditore Singolo</strong>,
              oppure come{" "}
              <strong className="font-semibold text-foreground">
                Investitore / Multi-Proprietario
              </strong>{" "}
              quando dagli immobili o dalle visure ne risultano più di uno. In questo modo puoi
              ricontattarlo immediatamente per fissare la valutazione del suo immobile, arrivando
              prima di qualsiasi agenzia concorrente.
            </>
          }
        />

        {/* Le voci restano allineate a sinistra dentro un blocco centrato: un
            elenco di spunte centrato costringe l'occhio a ripartire da una
            posizione diversa a ogni riga. */}
        <ul className="mx-auto mt-10 grid max-w-4xl gap-x-8 gap-y-3 sm:grid-cols-2">
          {[
            "Il potenziale venditore emerge dalla stessa conversazione",
            "Nessuna domanda in più al cliente: il dato passava già di lì",
            "Ordini l'elenco per portafoglio e i più promettenti salgono in cima",
            "L'incrocio con le visure te lo propone, non lo decide da solo",
          ].map((voce) => (
            <li key={voce} className="flex items-start gap-2.5 text-sm text-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-status-qualified" aria-hidden="true" />
              {voce}
            </li>
          ))}
        </ul>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
          {ALSO_INCLUDED.map((modulo) => {
            const Icon = modulo.icon;
            return (
              <div
                key={modulo.slug}
                id={modulo.slug}
                className="flex scroll-mt-20 items-start gap-3 rounded-xl border border-border bg-card p-5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">{modulo.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {modulo.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
