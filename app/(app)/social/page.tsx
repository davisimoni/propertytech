import { ModuleWithHistory } from "@/components/history/module-with-history";
import { SocialGenerator } from "@/components/social/social-generator";

export default function SocialPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Social &amp; Annunci</h1>
        <p className="text-sm text-muted-foreground">
          Da poche note sull&apos;immobile genera l&apos;annuncio per i portali, il post social e lo
          script del video Reel.
        </p>
      </div>

      <ModuleWithHistory kind="SOCIAL" workLabel="Genera" emptyHint="Gli annunci e i post che generi restano qui, pronti da ricopiare.">
        <SocialGenerator />
      </ModuleWithHistory>
    </div>
  );
}
