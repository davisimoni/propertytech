import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { BonusHeader } from "@/components/bonuses/bonus-header";
import { BonusLocked } from "@/components/bonuses/bonus-locked";
import { ReportValorizzazione } from "@/components/bonuses/report-valorizzazione";
import { BONUSES, bonusAccessibile } from "@/lib/bonuses";
import type { PlanId } from "@/lib/plans";

export default async function ReportValorizzazionePage() {
  const session = await auth();
  const currentPlanId: PlanId = session?.user?.planId ?? "trial";
  const bonus = BONUSES.find((b) => b.id === "report-valorizzazione");

  if (!bonus) notFound();

  if (!bonusAccessibile(currentPlanId, bonus.id)) {
    return <BonusLocked bonus={bonus} currentPlanId={currentPlanId} />;
  }

  return (
    <div className="space-y-6">
      <BonusHeader bonus={bonus} />
      <ReportValorizzazione />
    </div>
  );
}
