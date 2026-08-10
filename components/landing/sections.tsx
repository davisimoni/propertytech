import Link from "next/link";
import {
  AlarmClock,
  ArrowRight,
  Check,
  Clock,
  FileSearch2,
  MessagesSquare,
  Mic,
  MoonStar,
  PenLine,
  Share2,
  Sparkles,
  TrendingDown,
  UserX,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Reveal } from "@/components/landing/reveal";

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="text-xs font-semibold uppercase tracking-widest text-primary">{eyebrow}</span>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h2>
      {subtitle && <p className="mt-3 text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

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
          Filtra i curiosi su WhatsApp,
          <span className="bg-brand-gradient bg-clip-text text-transparent">
            {" "}
            acquisisci più incarichi
          </span>{" "}
          e chiudi le trattative in metà tempo
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Ogni notizia che arriva dai portali riceve risposta in pochi secondi e ti torna già
          qualificata: chi ha il mutuo, chi deve vendere prima, chi vuole solo guardare. Nel
          frattempo le visure diventano schede pronte, gli annunci si scrivono da soli e il
          proprietario riceve il report dopo ogni visita.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/register"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-gradient px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:shadow-lg hover:brightness-110 sm:w-auto"
          >
            Prova gratis
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="#moduli"
            className="inline-flex w-full items-center justify-center rounded-xl border border-border px-6 py-3 text-sm font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted sm:w-auto"
          >
            Guarda cosa fa
          </Link>
        </div>

        {/* Le tre obiezioni che fermano un agente prima di cliccare: quanto mi
            costa, quanto tempo mi ruba, dove finiscono i dati dei miei clienti. */}
        <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          {[
            "Nessuna carta di credito",
            "Attivo in 2 minuti",
            "Conforme al GDPR, dati in UE",
          ].map((item) => (
            <li key={item} className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 shrink-0 text-status-qualified" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ─────────────────────── 2. Il problema ─────────────────────── */

const PAIN_POINTS = [
  {
    icon: MoonStar,
    title: "Le richieste arrivano di sera e la domenica",
    body: "Su Immobiliare.it e Idealista i contatti scrivono dopo cena e nel weekend, quando l'ufficio è chiuso. Lunedì mattina richiami e l'acquirente ha già visitato con un'altra agenzia.",
  },
  {
    icon: FileSearch2,
    title: "Un pomeriggio perso su una visura",
    body: "Foglio, particella, subalterno, quote, rendita, difformità: da decifrare su PDF scansionati male e ricopiare a mano. Un numero sbagliato in un preliminare può costarti l'affare.",
  },
  {
    icon: PenLine,
    title: "Ogni immobile va riscritto da zero",
    body: "Testo per il portale, post per Instagram, idea per il Reel: due ore per ogni acquisizione. Ore sottratte agli appuntamenti che ti farebbero firmare il prossimo mandato.",
  },
  {
    icon: UserX,
    title: "Il proprietario non sa cosa sta succedendo",
    body: "Dopo le visite nessuno lo aggiorna. Si convince che non stiate lavorando, inizia a sentire altre agenzie e alla scadenza non rinnova.",
  },
];

export function ProblemSection() {
  return (
    <section className="border-t border-border bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Il problema"
          title="Passi più tempo a compilare che ad acquisire"
          subtitle="Non è una questione di impegno. È che le attività ripetitive occupano proprio le ore in cui potresti chiudere mandati."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {PAIN_POINTS.map((point) => {
            const Icon = point.icon;
            return (
              <div key={point.title} className="rounded-xl border border-border bg-card p-4 md:p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-status-blocked/10 text-status-blocked">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-foreground">{point.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{point.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ──────────────── 3. Il costo dell'inazione ──────────────── */

const COSTS = [
  {
    icon: AlarmClock,
    stat: "Chi risponde per primo",
    title: "La visita se la prende il concorrente",
    body: "Un acquirente che scrive a tre agenzie fissa con quella che risponde subito. Se ti muovi il giorno dopo, quella provvigione l'hai già persa — e non te ne accorgi nemmeno.",
  },
  {
    icon: Clock,
    stat: "Ogni settimana",
    title: "Ore di burocrazia al posto di acquisizioni",
    body: "Il tempo speso su visure e annunci non compare in nessun bilancio. Si vede nei mandati che non hai firmato perché eri alla scrivania invece che da un proprietario.",
  },
  {
    icon: TrendingDown,
    stat: "Alla scadenza",
    title: "Mandati che non si rinnovano",
    body: "Un venditore lasciato senza riscontri conclude che non state facendo abbastanza. Il mandato scade, passa a un'altra agenzia e l'immobile lo vende qualcun altro.",
  },
];

export function CostSection() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Cosa ti costa aspettare"
          title="L'agenzia che automatizza non lavora di più: arriva prima"
          subtitle="Ogni mese che passa è fatturato che si sposta verso il concorrente più veloce."
        />

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {COSTS.map((cost) => {
            const Icon = cost.icon;
            return (
              <div
                key={cost.title}
                className="rounded-xl border border-status-pending/30 bg-status-pending/5 p-5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-status-pending/15 text-status-pending">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-lg font-bold text-foreground">{cost.stat}</p>
                <h3 className="mt-1 text-sm font-semibold text-foreground">{cost.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{cost.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── 4. La soluzione ─────────────────── */

const MODULES = [
  {
    number: "01",
    slug: "modulo-whatsapp",
    icon: MessagesSquare,
    title: "Filtro notizie su WhatsApp, 24 ore su 24",
    tag: "Sempre attiva",
    body: "Ogni notizia da Immobiliare.it, Idealista e Casa.it riceve risposta in pochi secondi, anche di notte e la domenica. Capisce chi ha il mutuo deliberato, chi deve vendere prima di comprare e in quanto tempo vuole chiudere — poi propone direttamente gli orari liberi della tua agenda.",
    points: [
      "Il curioso lo filtra lei, tu chiami solo chi compra",
      "Lead qualificati con mutuo, tempistiche e vincoli",
      "Appuntamento in agenda senza che tu faccia nulla",
    ],
  },
  {
    number: "02",
    slug: "modulo-visure",
    icon: FileSearch2,
    title: "Visure e atti letti al posto tuo",
    tag: "In pochi secondi",
    body: "Carichi il PDF della visura, della planimetria, dell'atto o dell'APE e ricevi proprietari, quote, foglio, particella, subalterno, categoria e rendita già in chiaro, più due righe su cosa manca o non torna. Dieci pagine scansionate male diventano una scheda pronta per l'acquisizione.",
    points: [
      "Niente dati catastali ricopiati a mano",
      "Ti segnala subito difformità e documenti mancanti",
      "Scheda in PDF con il tuo logo, pronta per il cliente",
    ],
  },
  {
    number: "03",
    slug: "modulo-annunci",
    icon: Share2,
    title: "Un incarico, tutti i canali pronti",
    tag: "3 formati insieme",
    body: "Scrivi quattro righe sull'immobile — o incolli il link di un annuncio esistente — e ottieni con un clic il testo per i portali, il post per Instagram e Facebook con gli hashtag della tua zona e lo script del Reel scena per scena. L'immobile entra in portafoglio e parte lo Smart Matching con i tuoi lead.",
    points: [
      "Da due ore a due minuti per ogni acquisizione",
      "Feed XML pronto per il caricamento sui portali",
      "L'immobile si abbina da solo ai clienti in archivio",
    ],
  },
  {
    number: "04",
    slug: "modulo-report",
    icon: Mic,
    title: "Il proprietario aggiornato dopo ogni visita",
    tag: "Piano Enterprise",
    body: "Appena finita la visita parli 30 secondi al telefono, come faresti con un collega. Ricevi un report professionale per il proprietario, con i commenti dei visitatori riformulati in modo chiaro ma mai offensivo, pronto da mandare su WhatsApp. È quello che fa rinnovare il mandato alla scadenza.",
    points: [
      "Racconti la visita a voce, senza scrivere una riga",
      "Il proprietario vede che stai lavorando sul suo immobile",
      "Report con il tuo logo, inviato con un tocco",
    ],
  },
];

export function SolutionSection() {
  return (
    <section id="moduli" className="scroll-mt-20 border-t border-border bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <LogoMark className="mx-auto h-12 w-12" gradientId="pt-solution" />
          <span className="mt-4 block text-xs font-semibold uppercase tracking-widest text-primary">
            La soluzione
          </span>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Quattro assistenti che lavorano per la tua agenzia
          </h2>
          <p className="mt-3 text-muted-foreground">
            Ognuno si prende un compito che oggi ti ruba tempo e te lo restituisce già fatto.
          </p>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          {MODULES.map((module, index) => {
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
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{module.body}</p>

                <ul className="mt-4 space-y-1.5">
                  {module.points.map((point) => (
                    <li key={point} className="flex items-center gap-2 text-sm text-foreground">
                      <Check className="h-4 w-4 shrink-0 text-status-qualified" />
                      {point}
                    </li>
                  ))}
                </ul>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
