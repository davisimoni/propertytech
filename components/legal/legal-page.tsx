import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PublicNavbar } from "@/components/landing/public-navbar";
import { LandingFooter } from "@/components/landing/site-footer";
import { BRAND } from "@/lib/brand";

/** Data dell'ultima revisione, mostrata in testa a ogni documento. */
export const LEGAL_LAST_UPDATED = "6 agosto 2026";

/**
 * Titolare del trattamento. Il recapito arriva da `BRAND`, che è l'unica
 * fonte di verità: un solo indirizzo per privacy, supporto e footer.
 *
 * Prima ce n'erano due, uno per la privacy e uno per il supporto. Due costanti
 * con lo stesso significato divergono al primo aggiornamento fatto a metà, e
 * un recapito sbagliato in un'informativa è un contatto che l'interessato non
 * riesce a raggiungere per esercitare i propri diritti.
 */
export const LEGAL_ENTITY = {
  name: BRAND.name,
  email: BRAND.email,
} as const;

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: (string | ReactNode)[] }) {
  return (
    <ul className="ml-4 list-disc space-y-1.5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

interface LegalPageProps {
  title: string;
  intro: string;
  isLoggedIn: boolean;
  children: ReactNode;
}

export function LegalPage({ title, intro, isLoggedIn, children }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar isLoggedIn={isLoggedIn} />

      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Torna alla home
        </Link>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-xs text-muted-foreground">
          Ultimo aggiornamento: {LEGAL_LAST_UPDATED}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{intro}</p>

        <div className="mt-2 rounded-xl border border-status-pending/30 bg-status-pending/5 p-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Nota:</strong> questo documento è un modello di
            partenza e non sostituisce una consulenza legale. Prima della pubblicazione va rivisto da
            un legale e completato con i dati societari, il registro dei trattamenti e l&apos;elenco
            aggiornato dei responsabili esterni.
          </p>
        </div>

        {children}

        <div className="mt-10 border-t border-border pt-6">
          <p className="text-sm text-muted-foreground">
            Per qualsiasi domanda su questo documento scrivi a{" "}
            <a
              href={`mailto:${LEGAL_ENTITY.email}`}
              className="font-medium text-primary hover:underline"
            >
              {LEGAL_ENTITY.email}
            </a>
            .
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link href="/privacy" className="text-muted-foreground transition-colors hover:text-foreground">
              Privacy Policy
            </Link>
            <Link href="/termini" className="text-muted-foreground transition-colors hover:text-foreground">
              Termini di Servizio
            </Link>
            <Link href="/dpa" className="text-muted-foreground transition-colors hover:text-foreground">
              Trattamento dati (DPA)
            </Link>
            <Link href="/cookie" className="text-muted-foreground transition-colors hover:text-foreground">
              Cookie Policy
            </Link>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
