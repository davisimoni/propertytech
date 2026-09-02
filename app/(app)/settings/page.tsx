import { Suspense } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PlanGrid } from "@/components/billing/plan-grid";
import { SocialConnectPanel } from "@/components/settings/social-connect-panel";
import { CheckoutOutcomeBanner } from "@/components/billing/checkout-outcome-banner";
import { UsageWidget } from "@/components/billing/usage-widget";
import { BrandingPanel } from "@/components/settings/branding-panel";
import { AgencyProfilePanel } from "@/components/settings/agency-profile-panel";
import { IntegrationPanel } from "@/components/settings/integration-panel";
import { ReferralPanel } from "@/components/settings/referral-panel";
import { TeamPanel } from "@/components/settings/team-panel";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import type { PlanId } from "@/lib/plans";

const DATE_FORMAT = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Rome",
});

export default async function SettingsPage() {
  const session = await auth();
  const currentPlanId: PlanId = session?.user?.planId ?? "trial";

  const organization = session?.user?.organizationId
    ? await prisma.organization.findUnique({
        where: { id: session.user.organizationId },
        select: { dpaAcceptedAt: true, dpaAcceptedVersion: true },
      })
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Impostazioni &amp; Piano</h1>
        <p className="text-sm text-muted-foreground">
          Gestisci il piano della tua agenzia e i limiti di utilizzo.
        </p>
      </div>

      <Suspense>
        <CheckoutOutcomeBanner />
      </Suspense>

      <Suspense>
        <SettingsTabs
          profile={
            <div className="space-y-4">
              <BrandingPanel currentRole={session?.user?.role ?? "AGENT"} />
              <AgencyProfilePanel currentRole={session?.user?.role ?? "AGENT"} />
            </div>
          }
          team={
            <>
              <Link
                href="/settings/calendar"
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:bg-muted"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CalendarDays className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Agende &amp; Disponibilità</p>
                    <p className="text-sm text-muted-foreground">
                      Gestisci gli slot per le visite proposti dall&apos;assistente WhatsApp
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>

              <TeamPanel currentRole={session?.user?.role ?? "AGENT"} />
            </>
          }
          billing={
            /*
             * Listino e pulsanti d'acquisto solo al titolare.
             *
             * Le rotte Stripe rifiutavano gia' un collaboratore con un 403, ma
             * la sezione gli restava davanti: vedeva i piani, premeva "Passa a
             * Professional" e riceveva un errore. Un vincolo che si scopre solo
             * sbattendoci contro sembra un guasto del prodotto.
             *
             * Il consumo resta visibile a tutti, ed e' voluto: sapere quante
             * conversazioni restano serve a chi lavora, non a chi paga.
             */
            <>
              <UsageWidget variant="full" />
              {session?.user?.role === "OWNER" ? (
                /* PlanGrid legge `?interval=` dalla query: serve un confine Suspense. */
                <Suspense>
                  <PlanGrid currentPlanId={currentPlanId} />
                </Suspense>
              ) : (
                <section className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm font-medium text-foreground">
                    Abbonamento e fatturazione
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Li gestisce il titolare dell&apos;agenzia. Il tuo accesso e le tue funzioni
                    sono gia&apos; inclusi: non devi inserire nessun dato di pagamento.
                  </p>
                </section>
              )}
            </>
          }
          referral={<ReferralPanel />}
          integrations={
            <div className="space-y-4">
              <SocialConnectPanel currentRole={session?.user?.role ?? "AGENT"} />
              <IntegrationPanel />
            </div>
          }
          privacy={
            <section className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Trattamento dei dati</p>
                  {organization?.dpaAcceptedAt ? (
                    <p className="text-sm text-muted-foreground">
                      Accordo v{organization.dpaAcceptedVersion} accettato il{" "}
                      {DATE_FORMAT.format(organization.dpaAcceptedAt)}. I dati che carichi restano di
                      tua proprietà, risiedono su server UE e sono trattati solo per erogare il
                      servizio.
                    </p>
                  ) : (
                    <p className="text-sm text-status-pending">
                      Accordo non ancora accettato: completa l&apos;accettazione dalla Dashboard.
                    </p>
                  )}
                  <Link
                    href="/dpa"
                    className="mt-1 inline-block text-sm font-medium text-primary hover:underline"
                  >
                    Leggi l&apos;accordo
                  </Link>
                </div>
              </div>
            </section>
          }
        />
      </Suspense>
    </div>
  );
}
