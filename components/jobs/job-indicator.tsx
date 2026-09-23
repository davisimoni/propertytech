"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { JOB_LABELS, JOB_ROUTES, useJobs, type Job } from "@/components/jobs/job-provider";
import { cn } from "@/lib/utils";

/**
 * Quanto resta a schermo un avviso di lavoro concluso.
 *
 * Dieci secondi e non cinque: questo avviso compare **mentre l'agente e'
 * altrove**, spesso a meta' di un'altra cosa, quindi il tempo di accorgersene
 * non e' quello di un avviso che segue un clic appena dato.
 */
const DURATA_AVVISO_MS = 10_000;

/**
 * Riquadro in basso a destra: cosa sta lavorando mentre l'agente è altrove.
 *
 * # Perché sparisce sulla pagina del modulo
 *
 * Perché lì il modulo mostra già il suo stato, e due indicatori per la stessa
 * cosa fanno dubitare che siano due lavorazioni. Il riquadro serve solo dove
 * quell'informazione non c'è.
 *
 * # Perché mostra anche i lavori finiti
 *
 * Perché è quello il momento utile. "In corso" dice solo di aspettare;
 * "pronto" è la riga su cui si clicca per andare a vedere, ed è la ragione per
 * cui l'agente può permettersi di cambiare pagina invece di restare a
 * guardare una barra.
 *
 * Non si chiude a mano: sparisce da sé tornando sul modulo, oppure dopo dieci
 * secondi quando il lavoro è concluso. Una X in più darebbe da chiudere una
 * notifica che si chiude già da sola.
 *
 * # Cosa NON si chiude da sé, e perché
 *
 * Gli avvisi di lavoro **in corso** restano: dicono che c'è qualcosa che sta
 * girando, e farli sparire lascerebbe l'agente a chiedersi se l'elaborazione
 * sia ancora viva.
 *
 * Gli avvisi **non riusciti** restano anche loro. Un successo che sparisce non
 * porta via niente — il risultato è nel modulo e nella Cronologia — mentre un
 * errore che sparisce porta via l'unica notizia del fallimento: l'agente
 * tornerebbe sul modulo convinto di trovare un annuncio che non è mai stato
 * generato.
 */
export function JobIndicator() {
  const { jobs } = useJobs();
  const pathname = usePathname();

  // Nulla di ciò che riguarda la pagina aperta: lì lo stato lo dà il modulo.
  // E nulla di già chiuso, a mano o dal tempo.
  const daMostrare = jobs.filter(
    (job) => pathname !== JOB_ROUTES[job.kind] && !job.noticeDismissed
  );

  if (daMostrare.length === 0) return null;

  return (
    <div
      // `polite`: annunciato dai lettori di schermo senza interrompere quello
      // che l'agente sta facendo nell'altra pagina.
      aria-live="polite"
      className="fixed bottom-20 right-4 z-40 flex w-64 flex-col gap-2 sm:bottom-4"
    >
      {daMostrare.map((job) => (
        <RigaLavorazione key={job.id} job={job} />
      ))}
    </div>
  );
}

function RigaLavorazione({ job }: { job: Job }) {
  const { dismissJobNotice } = useJobs();
  const inCorso = job.status === "running";
  const fallita = job.status === "error";

  useEffect(() => {
    // Solo i lavori conclusi bene: gli altri due stati hanno ragioni per
    // restare, spiegate in testa al file.
    if (inCorso || fallita) return;

    const timer = window.setTimeout(() => dismissJobNotice(job.id), DURATA_AVVISO_MS);
    return () => window.clearTimeout(timer);
  }, [inCorso, fallita, job.id, dismissJobNotice]);

  return (
    <Link
      href={JOB_ROUTES[job.kind]}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border bg-card p-3 shadow-lg transition-all duration-200 hover:shadow-xl",
        fallita ? "border-status-blocked/40" : inCorso ? "border-border" : "border-primary/40"
      )}
    >
      <span className="mt-0.5 shrink-0">
        {inCorso ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : fallita ? (
          <AlertTriangle className="h-4 w-4 text-status-blocked" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-status-qualified" />
        )}
      </span>

      <span className="min-w-0">
        <span className="block text-xs font-semibold text-foreground">
          {inCorso
            ? `${JOB_LABELS[job.kind]} in corso…`
            : fallita
              ? `${JOB_LABELS[job.kind]}: non riuscita`
              : `${JOB_LABELS[job.kind]}: pronta`}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{job.title}</span>
        <span className="mt-1 block text-[11px] font-medium text-primary">
          {inCorso ? "Puoi continuare a lavorare" : "Tocca per vedere il risultato"}
        </span>
      </span>
    </Link>
  );
}
