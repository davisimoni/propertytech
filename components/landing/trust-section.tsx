import Link from "next/link";
import { KeyRound, Lock, MapPin, ShieldCheck, UserCog } from "lucide-react";
import { Reveal } from "./reveal";
import { SectionHeading } from "@/components/landing/section-heading";

/**
 * Sezione sicurezza e conformità.
 *
 * # Perché sta dopo i moduli e prima dei prezzi
 *
 * A questo punto della pagina l'agente ha capito cosa fa il software e sta per
 * guardare quanto costa. Nel mezzo passa l'obiezione che ferma davvero chi
 * gestisce dati di clienti: *dove finiscono i numeri di telefono e i codici
 * fiscali che questo sistema legge?*
 *
 * Lasciarla senza risposta significa che se la porrà davanti al prezzo, dove
 * pesa il doppio.
 *
 * # Perché è specifica e non rassicurante
 *
 * "Sicurezza di livello enterprise" non dice niente e chiunque può scriverlo.
 * Ogni voce qui sotto è un fatto verificabile del prodotto: la regione dei
 * server, cosa viene cifrato, cosa succede a chi revoca il consenso.
 */

const GARANZIE = [
  {
    icon: MapPin,
    title: "Database e server principali in Unione Europea",
    body: "Database e calcolo dell'applicazione restano a Francoforte: lì stanno i nomi dei tuoi clienti, i telefoni e i codici fiscali letti dalle visure. La sola trascrizione delle note vocali passa da un fornitore statunitense, con le garanzie previste dal GDPR e senza conservare l'audio.",
  },
  {
    icon: Lock,
    title: "Credenziali cifrate a riposo",
    body: "Il collegamento WhatsApp e le chiavi dei gestionali sono cifrati in AES-256. Chi leggesse una copia del database non troverebbe nulla di utilizzabile.",
  },
  {
    icon: ShieldCheck,
    title: "GDPR nel flusso, non nel disclaimer",
    body: "Il primo messaggio a un contatto porta l'informativa e il modo per cancellarsi. Chi risponde STOP esce subito e non riceve più nulla, nemmeno un promemoria.",
  },
  {
    icon: UserCog,
    title: "Titolare e collaboratori, ruoli distinti",
    body: "Il titolare invita gli agenti via email e assegna i contatti. Ognuno segue i propri lead e riceve solo i propri avvisi; il titolare vede tutto.",
  },
  {
    icon: KeyRound,
    title: "Accesso protetto e recuperabile",
    body: "Recupero password con link valido un'ora e usabile una volta sola, avviso via email a ogni accesso da un dispositivo nuovo.",
  },
];

export function TrustSection() {
  return (
    <section
      id="sicurezza"
      className="scroll-mt-20 border-t border-border py-20"
      aria-labelledby="sicurezza-titolo"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/*
          Il titolo diceva "non escono dall'Europa". Da quando la trascrizione
          delle note vocali e' dichiarata su un fornitore statunitense, quella
          frase contraddice il riquadro che sta due centimetri piu' sotto — ed
          e' il tipo di contraddizione che un'agenzia nota proprio nella
          sezione in cui le stiamo chiedendo di fidarsi. Quello che possiamo
          promettere davvero non e' che i dati non escano mai: e' che sia
          scritto dove vanno, fornitore per fornitore.
        */}
        <SectionHeading
          titleId="sicurezza-titolo"
          eyebrow="Sicurezza e conformità"
          title="Sai sempre dove finiscono i dati dei tuoi clienti"
          subtitle="Tratti dati di persone che ti hanno dato fiducia. Ecco cosa facciamo perché resti meritata."
        />

        {/*
          Griglia che degrada per gradi: tre colonne su schermo largo, due su
          tablet, una sul telefono. Le cinque voci non stanno mai su una riga
          sola, quindi l'ultima riga resta spaiata: `lg:last:col-span-1` non
          serve — la si lascia allineata a sinistra, che è come si legge.
        */}
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GARANZIE.map((garanzia, index) => {
            const Icon = garanzia.icon;
            return (
              <Reveal key={garanzia.title} delayMs={index * 70} className="flex">
                <div className="flex w-full flex-col rounded-xl border border-border bg-card p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-sm font-semibold text-foreground">{garanzia.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {garanzia.body}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Alla registrazione accetti l&apos;accordo sul trattamento dei dati ex art. 28 GDPR.{" "}
          <Link href="/privacy" className="font-medium text-primary hover:underline">
            Leggi l&apos;informativa completa
          </Link>
        </p>
      </div>
    </section>
  );
}
