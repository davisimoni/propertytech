import { auth } from "@/auth";
import { BonusGrid } from "@/components/bonuses/bonus-grid";
import { InfoTip } from "@/components/shared/info-tip";
import { bonusDisponibili } from "@/lib/bonuses";
import { PLANS, type PlanId } from "@/lib/plans";

export default async function BonusesPage() {
  const session = await auth();
  const currentPlanId: PlanId = session?.user?.planId ?? "trial";
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

      <BonusGrid currentPlanId={currentPlanId} />
    </div>
  );
}
