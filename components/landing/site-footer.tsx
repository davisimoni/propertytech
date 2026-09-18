import Link from "next/link";
import { Facebook, Instagram, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ReferralFooterLink } from "@/components/referrals/referral-footer-link";
import { ReferralPromo } from "@/components/referrals/referral-promo";
import { CookieBanner } from "./cookie-banner";
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
      { label: "Annunci & Portali", href: "/#modulo-annunci" },
      { label: "Report Vocali", href: "/#modulo-report" },
      { label: "Abbinamento Lead e Immobili", href: "/#come-funziona" },
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
      // Indirizzo pubblico richiesto da Meta per la cancellazione dei dati
      // ottenuti tramite Facebook, e strada per l'art. 17 GDPR.
      { label: "Cancellazione dati", href: "/data-deletion" },
    ],
  },
];

const SOCIAL_LINKS: { label: string; href: string; Icon: LucideIcon }[] = [
  { label: "Instagram", href: BRAND.social.instagram, Icon: Instagram },
  { label: "Facebook", href: BRAND.social.facebook, Icon: Facebook },
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

        {/*
          Tre blocchi: copyright, social, contatto.

          Su desktop i due laterali hanno `flex-1` con base zero: occupano
          esattamente lo stesso spazio qualunque sia la lunghezza del testo, ed
          è questo che tiene le icone al centro della riga e non al centro dello
          spazio avanzato. Con il solo `justify-between` le icone si sarebbero
          spostate verso il testo più corto.

          Su mobile si impilano centrati: un copyright allineato a sinistra
          sopra due icone centrate sembra un errore di impaginazione.
        */}
        <div className="mt-14 flex flex-col items-center gap-4 border-t border-border pt-8 md:flex-row md:gap-6">
          <p className="text-center text-xs text-muted-foreground md:flex-1 md:basis-0 md:text-left">
            © {year} {BRAND.name}. Tutti i diritti riservati. ·{" "}
            {/* Etichetta e numero sulla stessa riga: "P.IVA" a fine riga e il
                numero sotto si leggono come due dati diversi. */}
            <span className="whitespace-nowrap">P.IVA {BRAND.vatNumber}</span>
          </p>

          <div className="flex items-center justify-center gap-4">
            {SOCIAL_LINKS.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${BRAND.name} su ${label} (si apre in una nuova scheda)`}
                title={label}
                // Area cliccabile di 40px attorno a un'icona da 20: sul
                // telefono un bersaglio grande quanto l'icona si manca.
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </a>
            ))}
          </div>

          <p className="inline-flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground md:flex-1 md:basis-0 md:justify-end">
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

      {/* Stessa ragione del popup referral: il footer e' l'unico elemento
          comune a tutta l'area pubblica, quindi chi atterra su /privacy o
          /guida da una ricerca vede l'avviso esattamente come chi arriva
          dalla home. Le regole di comparsa e memorizzazione sono dentro il
          componente: montarlo altrove non le cambia. */}
      <CookieBanner />
    </footer>
  );
}
