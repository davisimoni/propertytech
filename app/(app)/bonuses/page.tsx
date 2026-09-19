import { auth } from "@/auth";
import { BonusGrid } from "@/components/bonuses/bonus-grid";
import { InfoTip } from "@/components/shared/info-tip";
import { ScheduledChangeNotice } from "@/components/billing/scheduled-change-notice";
import { bonusDisponibili } from "@/lib/bonuses";
import { cambioProgrammato, pianoCorrente } from "@/lib/feature-access";
import { PLANS } from "@/lib/plans";

export default async function BonusesPage() {
  const session = await auth();
  // Dal database: dopo un cambio piano il token porta ancora quello di prima.
  const currentPlanId = await pianoCorrente(session?.user?.organizationId);
  const cambio = await cambioProgrammato(session?.user?.organizationId);
  const disponibili = bonusDisponibili(currentPlanId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-1.5 text-xl font-semibold text-foreground">
          Bonus Riservati
          <InfoTip label="Strumenti inclusi nel piano che lavorano sulla parte del mestiere che i moduli non toccano: l'acquisizione dell'incarico. Non consumano crediti." />
        </h1>
        <p className="text-sm text-muted-foreground">
          {disponibili.length === 0
            ? "I bonus si sbloccano con i piani a pagamento. Qui trovi cosa fa ciascuno."
            : `Con il piano ${PLANS[currentPlanId].name} hai ${
                disponibili.length === 1 ? "un bonus attivo" : `${disponibili.length} bonus attivi`
              }. Non consumano crediti operativi.`}
        </p>
      </div>

      {cambio && (
        <ScheduledChangeNotice
          cambio={cambio}
          pianoAttuale={currentPlanId}
          puoGestire={session?.user?.role === "OWNER"}
          conBonus
        />
      )}

      <BonusGrid currentPlanId={currentPlanId} />
    </div>
  );
}
