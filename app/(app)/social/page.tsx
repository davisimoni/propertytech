import { ModuleWithHistory } from "@/components/history/module-with-history";
import { SocialGenerator } from "@/components/social/social-generator";
import { SocialConnectionBadge } from "@/components/social/publish-button";

export default function SocialPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Social &amp; Annunci</h1>
          <p className="text-sm text-muted-foreground">
            Incolla il link di un annuncio o descrivi l&apos;immobile: ottieni il testo per i
            portali, il post social e lo script del video Reel.
          </p>
        </div>
        {/* Discreto e in alto: dice se si potra' pubblicare direttamente,
            prima che l'agente generi qualcosa e lo scopra alla fine. */}
        <SocialConnectionBadge />
      </div>

      <ModuleWithHistory kind="SOCIAL" workLabel="Genera" emptyHint="Gli annunci e i post che generi restano qui, pronti da ricopiare.">
        <SocialGenerator />
      </ModuleWithHistory>
    </div>
  );
}
