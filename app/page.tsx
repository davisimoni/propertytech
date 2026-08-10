import type { Metadata } from "next";
import { auth } from "@/auth";
import { PublicNavbar } from "@/components/landing/public-navbar";
import { FaqSection } from "@/components/landing/faq-section";
import { SupportWidget } from "@/components/support/support-widget";
import { ContactSection } from "@/components/landing/contact-section";
import {
  CostSection,
  HeroSection,
  ProblemSection,
  SolutionSection,
} from "@/components/landing/sections";
import { LandingFooter } from "@/components/landing/site-footer";
import { PricingSection } from "@/components/landing/pricing-section";
import { StatsSection } from "@/components/landing/stats-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { buildStructuredData, SEO } from "@/lib/seo";

export const metadata: Metadata = {
  // `absolute` evita che il template del layout aggiunga il suffisso a un
  // titolo che già contiene il nome del brand.
  title: { absolute: SEO.title },
  description: SEO.description,
  alternates: { canonical: "/" },
};

/**
 * Landing pubblica sulla rotta principale.
 *
 * Accessibile senza autenticazione: il middleware non protegge `/`. La sessione
 * viene letta solo per adattare la CTA della navbar, mai per redirigere —
 * un visitatore deve poter leggere la pagina fino in fondo.
 */
export default async function LandingPage() {
  const session = await auth();

  return (
    <div className="min-h-screen bg-background">
      {/* Dati strutturati Schema.org: descrivono il prodotto a Google e ai
          crawler generativi in forma dichiarativa, indipendente dal layout. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildStructuredData()) }}
      />

      <PublicNavbar isLoggedIn={Boolean(session?.user)} />
      <main>
        <HeroSection />
        {/* Subito dopo l'hero: chi scorre di poco deve incontrare i numeri
            prima dei problemi, così sa già cosa sta valutando. */}
        <StatsSection />
        <ProblemSection />
        <CostSection />
        <SolutionSection />
        {/* Dopo i moduli e prima dei prezzi: chi ha capito cosa fa la
            piattaforma vuole sapere quanto lavoro gli costa, prima di
            guardare quanto costa in euro. */}
        <HowItWorksSection />
        <PricingSection isLoggedIn={Boolean(session?.user)} />
        <FaqSection />
        {/* Ultima sezione prima del footer: chi è arrivato in fondo alle FAQ
            senza convertirsi ha una domanda specifica, e questo è il punto in
            cui gliela si può far scrivere. */}
        <ContactSection />
      </main>
      <LandingFooter />
      <SupportWidget />
    </div>
  );
}
