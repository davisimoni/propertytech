import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { BonusHeader } from "@/components/bonuses/bonus-header";
import { BonusLocked } from "@/components/bonuses/bonus-locked";
import { ScriptObiezioni } from "@/components/bonuses/script-obiezioni";
import { BONUSES, bonusAccessibile } from "@/lib/bonuses";
import type { PlanId } from "@/lib/plans";

export default async function ScriptObiezioniPage() {
  const session = await auth();
  const currentPlanId: PlanId = session?.user?.planId ?? "trial";
  const bonus = BONUSES.find((b) => b.id === "script-obiezioni");

  if (!bonus) notFound();

  if (!bonusAccessibile(currentPlanId, bonus.id)) {
    return <BonusLocked bonus={bonus} currentPlanId={currentPlanId} />;
  }

  return (
    <div className="space-y-6">
      <BonusHeader bonus={bonus} />
      <ScriptObiezioni agencyName={session?.user?.agencyName ?? "la nostra agenzia"} />
    </div>
  );
}
