import type { ReactNode } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { ToastProvider } from "@/components/shared/toast-provider";
import { DpaAcceptancePrompt } from "@/components/dashboard/dpa-acceptance-prompt";
import { ReferralPromo } from "@/components/referrals/referral-promo";
import { SupportWidget } from "@/components/support/support-widget";

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
      </AppShell>
    </ToastProvider>
  );
}
