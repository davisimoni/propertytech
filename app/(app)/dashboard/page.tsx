import { Clock, FileText, UserCheck } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MetricCard } from "@/components/dashboard/metric-card";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { SmartMatches } from "@/components/dashboard/smart-matches";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { UpcomingAppointments } from "@/components/dashboard/upcoming-appointments";
import { AgencyNamePrompt } from "@/components/dashboard/agency-name-prompt";
import { formatTimeSaved, getRoiMetrics, MINUTES_SAVED } from "@/lib/metrics";

/**
 * L'accettazione del DPA è verificata nel layout del gruppo `(app)`: se manca,
 * questa pagina non viene nemmeno renderizzata. Qui resta il solo
 * completamento del nome agenzia, che è un suggerimento e non un requisito.
 */
export default async function DashboardPage() {
  const session = await auth();

  // Letto lato server: evita una fetch client aggiuntiva solo per decidere se
  // mostrare il banner di completamento profilo.
  const organizationId = session?.user?.organizationId;

  const [organization, metrics] = await Promise.all([
    organizationId
      ? prisma.organization.findUnique({
          where: { id: organizationId },
          select: { agencyName: true, agencyNameConfirmed: true },
        })
      : null,
    organizationId
      ? getRoiMetrics(organizationId)
      : { qualifiedLeads: 0, documentsAnalyzed: 0, hoursSaved: 0, minutesSaved: 0 },
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Cosa ha fatto l&apos;assistente per la tua agenzia mentre eri fuori.
        </p>
      </div>

      {organization && !organization.agencyNameConfirmed && (
        <AgencyNamePrompt initialName={organization.agencyName} />
      )}

      <OnboardingChecklist />

      {/* Sopra le metriche: un appuntamento fra due ore vale piu' di un
          conteggio del mese. Sparisce da sola se non ce ne sono. */}
      {organizationId && <UpcomingAppointments organizationId={organizationId} />}

      <div>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label="Notizie qualificate"
            value={metrics.qualifiedLeads}
            icon={UserCheck}
            hint="Contatti con mutuo, tempistiche e vincoli già accertati"
          />
          <MetricCard
            label="Visure e atti letti"
            value={metrics.documentsAnalyzed}
            icon={FileText}
            hint="Dati catastali estratti senza ricopiarli a mano"
          />
          <MetricCard
            label="Ore tornate in agenda"
            value={formatTimeSaved(metrics.minutesSaved)}
            icon={Clock}
            highlighted
            hint={`${MINUTES_SAVED.perQualifiedLead} min per notizia · ${MINUTES_SAVED.perDocument} min per visura`}
          />
        </div>

        {/* La stima va dichiarata come tale: presentarla come misurazione
            sarebbe fuorviante per chi la usa per valutare l'abbonamento. */}
        <p className="mt-2 text-xs text-muted-foreground">
          Il tempo risparmiato è una stima basata sulla durata media delle stesse attività svolte a
          mano.
        </p>
      </div>

      <SmartMatches />

      <QuickActions />
    </div>
  );
}
