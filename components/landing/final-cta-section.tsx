import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

/**
 * Ultimo invito prima del footer.
 *
 * # Perché serve, visto che l'hero ha già una CTA
 *
 * Chi arriva qui ha letto moduli, prezzi, domande frequenti e garanzie: ha
 * fatto tutto il lavoro di valutazione e si trova con lo scorrimento a fondo
 * pagina, dove l'unica cosa raggiungibile è il footer. Rimandarlo in cima per
 * cliccare è un attrito che costa conversioni per niente.
 *
 * # Perché ripete i badge di fiducia
 *
 * Sono le stesse tre obiezioni dell'hero — costo, tempo, dati — ma qui pesano
 * diversamente: nell'hero rassicurano chi non sa cosa sta guardando, qui
 * tolgono l'ultimo motivo per rimandare a chi ha già deciso che gli
 * interessa.
 */
export function FinalCtaSection({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  return (
    <section className="border-t border-border py-16 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-8 text-center sm:p-12">
          {/* Alone di brand appena accennato: dà rilievo al riquadro senza
              trasformarlo in un banner pubblicitario. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-brand-gradient opacity-[0.10] blur-3xl"
          />

          <div className="relative">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              La prossima notizia che arriva stanotte,
              <span className="bg-brand-gradient bg-clip-text text-transparent">
                {" "}
                chi la risponde?
              </span>
            </h2>

            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
              Colleghi WhatsApp in due minuti e la prima richiesta arriva già qualificata. Se non ti
              convince, chiudi l&apos;account: non hai lasciato una carta.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={isLoggedIn ? "/dashboard" : "/register"}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-gradient px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:shadow-lg hover:brightness-110 sm:w-auto"
              >
                {isLoggedIn ? "Vai alla dashboard" : "Inizia la prova gratuita"}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#contatti"
                className="inline-flex w-full items-center justify-center rounded-xl border border-border-strong px-6 py-3 text-sm font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-muted sm:w-auto"
              >
                Parla con noi
              </Link>
            </div>

            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              {["Nessuna carta di credito", "Attivo in 2 minuti", "Dati in UE, conforme al GDPR"].map(
                (voce) => (
                  <li key={voce} className="inline-flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 shrink-0 text-status-qualified" aria-hidden="true" />
                    {voce}
                  </li>
                )
              )}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
