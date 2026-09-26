import type { Metadata } from "next";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { ToastProvider } from "@/components/shared/toast-provider";
import { JobProvider } from "@/components/jobs/job-provider";
import { JobIndicator } from "@/components/jobs/job-indicator";
import { DpaAcceptancePrompt } from "@/components/dashboard/dpa-acceptance-prompt";
import { ReferralPromo } from "@/components/referrals/referral-promo";
import { SupportWidget } from "@/components/support/support-widget";

/**
 * Nessuna pagina di quest'area va indicizzata.
 *
 * # Perché serve, visto che c'è già `robots.txt`
 *
 * Perché i due strumenti fanno cose diverse. `Disallow` dice di **non
 * visitare**, `noindex` dice di **non indicizzare**: un indirizzo bloccato in
 * `robots.txt` può comunque finire nei risultati, senza descrizione, se
 * qualcuno lo linka da fuori — è il caso classico della pagina che compare
 * come «Nessuna informazione disponibile per questa pagina».
 *
 * # E perché non basta neanche questo da solo
 *
 * Perché un crawler che rispetta il `Disallow` non visita la pagina e quindi
 * non legge mai questo tag. I due si coprono a vicenda e nessuno dei due
 * sostituisce l'altro: il `Disallow` ferma la scansione, questo tag copre il
 * caso in cui qualcuno arrivi lo stesso.
 *
 * A monte c'è comunque l'autenticazione, che a un crawler restituisce un
 * reindirizzamento al login. Questi due sono la seconda e la terza rete.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Il gate sull'accordo di trattamento vive qui e non nella singola dashboard:
 * ogni rotta di questo gruppo tratta dati di terzi, e dopo l'accesso l'utente
 * può atterrare direttamente su una qualsiasi di esse (link profondo, o
 * `callbackUrl` propagato dal middleware). Un controllo su una sola pagina
 * sarebbe aggirabile semplicemente digitando un altro indirizzo.
 */
export default async function AppGroupLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  const organization = session?.user?.organizationId
    ? await prisma.organization.findUnique({
        where: { id: session.user.organizationId },
        select: { dpaAcceptedAt: true },
      })
    : null;

  const needsDpaAcceptance = Boolean(organization && !organization.dpaAcceptedAt);

  return (
    // Il provider avvolge l'intera area riservata: cosi' qualunque pannello
    // puo' dare un riscontro immediato senza montarsi il proprio avviso, e il
    // feedback ha la stessa forma in ogni pagina.
    <ToastProvider>
      {/* Le elaborazioni AI vivono qui, non nei moduli che le lanciano: il
          layout non si smonta cambiando pagina, quindi una generazione
          continua e il suo risultato e' ancora li' al ritorno. */}
      <JobProvider>
      <AppShell>
        {needsDpaAcceptance ? (
          <div className="mx-auto max-w-2xl space-y-4">
            <div>
              <h1 className="text-xl font-semibold text-foreground">Benvenuto in PropertyTech</h1>
              <p className="text-sm text-muted-foreground">
                Manca un solo passaggio prima di poter usare il servizio.
              </p>
            </div>
            <DpaAcceptancePrompt />
          </div>
        ) : (
          children
        )}
        <SupportWidget />

        {/* L'area riservata non monta il footer (vedi site-footer.tsx), quindi
            il popup va montato qui a parte: è proprio l'agente già dentro il
            prodotto quello che ha più motivo di invitare un collega.
            Escluso mentre manca l'accettazione del DPA: quel passaggio è
            bloccante e non va coperto da una promozione. */}
        {!needsDpaAcceptance && <ReferralPromo />}

        {/* Fuori dal gate del DPA: chi non l'ha accettato non ha potuto
            lanciare nessuna elaborazione. */}
        {!needsDpaAcceptance && <JobIndicator />}
      </AppShell>
      </JobProvider>
    </ToastProvider>
  );
}
