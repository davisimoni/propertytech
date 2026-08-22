import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ReferralFooterLink } from "@/components/referrals/referral-footer-link";
import { ReferralPromo } from "@/components/referrals/referral-promo";
import { BRAND } from "@/lib/brand";

/**
 * Footer esteso della sola area pubblica: landing e pagine legali.
 *
 * L'area riservata non lo monta: dentro l'applicazione l'agente sta
 * lavorando, e una colonna di link commerciali sotto ogni schermata è rumore.
 * Le voci che gli servono davvero vivono nel menu profilo dell'header
 * (`components/layout/profile-menu.tsx`).
 */

interface FooterLink {
  label: string;
  href: string;
  /** `true` per i `mailto:`, che non devono passare dal router di Next. */
  external?: boolean;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

/** Oggetto della mail, così la richiesta arriva già smistata. */
function mailto(address: string, subject: string): string {
  return `mailto:${address}?subject=${encodeURIComponent(subject)}`;
}

const COLUMNS: FooterColumn[] = [
  {
    title: "Soluzioni",
    links: [
      { label: "Filtro WhatsApp 24/7", href: "/#modulo-whatsapp" },
      { label: "Lettura Visure & Atti", href: "/#modulo-visure" },
      { label: "Annunci & Portali XML", href: "/#modulo-annunci" },
      { label: "Report Vocali", href: "/#modulo-report" },
      { label: "CRM & Smart Matching", href: "/#come-funziona" },
    ],
  },
  {
    title: "Risorse",
    links: [
      { label: "Prezzi", href: "/#prezzi" },
      { label: "Guida e documentazione", href: "/guida" },
      { label: "FAQ Agenti", href: "/#faq" },
      {
        label: "Assistenza",
        href: mailto(BRAND.supportEmail, "Assistenza PropertyTech"),
        external: true,
      },
    ],
  },
  {
    title: "Legale & GDPR",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Termini e Condizioni", href: "/termini" },
      { label: "Cookie Policy", href: "/cookie" },
      { label: "Trattamento dati (DPA)", href: "/dpa" },
    ],
  },
];

const LINK_CLASS =
  "text-sm text-muted-foreground transition-colors hover:text-foreground";

export function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        {/*
          Sei tracce su desktop: il blocco marchio ne occupa due, le tre colonne
          di link una ciascuna. Dando al marchio il doppio dello spazio, i link
          partono più a destra e il logo smette di sembrarci attaccato. Il
          `gap-16` fa il resto.
        */}
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-6 lg:gap-16">
          <div className="lg:col-span-2">
            <Logo gradientId="pt-footer" />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">{BRAND.tagline}</p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                {column.title}
              </h2>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a href={link.href} className={LINK_CLASS}>
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className={LINK_CLASS}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}

                {/* Voce fuori dall'elenco dichiarativo perché è un'azione, non
                    una destinazione: apre il popup invece di navigare. */}
                {column.title === "Risorse" && (
                  <li>
                    <ReferralFooterLink className={LINK_CLASS} />
                  </li>
                )}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            © {year} {BRAND.name}. Tutti i diritti riservati. · P.IVA {BRAND.vatNumber}
          </p>
          <p className="inline-flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{BRAND.name}</span>
            <span aria-hidden="true">·</span>
            <a
              href={`mailto:${BRAND.email}`}
              className="font-medium text-primary transition-colors hover:underline"
            >
              {BRAND.email}
            </a>
          </p>
        </div>
      </div>

      {/* Montato qui e non nelle singole pagine: il footer è l'unico elemento
          presente su tutta l'area pubblica (landing, guida, pagine legali),
          quindi il popup e il link che lo apre restano sempre insieme. */}
      <ReferralPromo />
    </footer>
  );
}
