import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, Info } from "lucide-react";
import { auth } from "@/auth";
import { PublicNavbar } from "@/components/landing/public-navbar";
import { LandingFooter } from "@/components/landing/site-footer";
import { GUIDE_SECTIONS } from "@/lib/guide";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Guida e documentazione — ${BRAND.name}`,
  description:
    "Come usare PropertyTech giorno per giorno: filtro notizie su WhatsApp, lettura visure, annunci per i portali, Match Perfetti e report ai proprietari.",
  alternates: { canonical: "/guida" },
};

/**
 * Guida operativa, raggiungibile sia dal menu profilo dell'area riservata sia
 * dal footer pubblico.
 *
 * Pagina pubblica di proposito: non contiene dati di nessuna agenzia, e chi sta
 * valutando l'abbonamento ha diritto di vedere come si lavora davvero con lo
 * strumento prima di registrarsi.
 */
export default async function GuidePage() {
  const session = await auth();

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar isLoggedIn={Boolean(session?.user)} />

      <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <Link
          href={session?.user ? "/dashboard" : "/"}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {session?.user ? "Torna alla dashboard" : "Torna alla home"}
        </Link>

        <div className="mt-4 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-sm">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Guida e documentazione
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Come si lavora con {BRAND.name} giorno per giorno. Ogni capitolo dice cosa fare e cosa
              succede dopo, senza gerghi tecnici.
            </p>
          </div>
        </div>

        {/* Indice generato dalle stesse sezioni del corpo: non possono divergere. */}
        <nav aria-label="Indice della guida" className="mt-8 rounded-xl border border-border bg-card p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            In questa guida
          </h2>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {GUIDE_SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowRight className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          {GUIDE_SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-20">
              <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{section.intro}</p>

              {section.steps && (
                <ol className="mt-4 space-y-3">
                  {section.steps.map((step, index) => (
                    <li key={step.action} className="flex gap-3 rounded-xl border border-border bg-card p-4">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{step.action}</p>
                        {step.detail && (
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {step.detail}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              {section.notes && (
                <ul className="mt-4 space-y-2">
                  {section.notes.map((note) => (
                    <li
                      key={note}
                      className="flex gap-2.5 rounded-lg border border-primary/25 bg-primary/5 p-3"
                    >
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <p className="text-sm leading-relaxed text-foreground">{note}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-xl border border-border bg-muted/40 p-5">
          <h2 className="text-sm font-semibold text-foreground">Non hai trovato quello che cercavi?</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Scrivici a{" "}
            <a
              href={`mailto:${BRAND.supportEmail}`}
              className="font-medium text-primary hover:underline"
            >
              {BRAND.supportEmail}
            </a>{" "}
            e ti rispondiamo.
          </p>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
