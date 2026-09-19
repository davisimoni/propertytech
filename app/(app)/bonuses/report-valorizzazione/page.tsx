import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { BonusHeader } from "@/components/bonuses/bonus-header";
import { BonusLocked } from "@/components/bonuses/bonus-locked";
import { ReportValorizzazione } from "@/components/bonuses/report-valorizzazione";
import { BONUSES, bonusAccessibile } from "@/lib/bonuses";
import { pianoCorrente } from "@/lib/feature-access";

export default async function ReportValorizzazionePage() {
  const session = await auth();
  // Dal database: e' l'unico cancello di questo strumento, che gira nel browser.
  const currentPlanId = await pianoCorrente(session?.user?.organizationId);
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
