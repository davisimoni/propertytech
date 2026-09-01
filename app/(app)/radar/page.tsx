import { auth } from "@/auth";
import { RadarBoard } from "@/components/radar/radar-board";

/**
 * Il nome dell'agenzia si legge qui e scende come proprieta': i componenti
 * client non hanno accesso alla sessione, e il copy da pubblicare esce
 * firmato — senza nome finirebbe con una firma vuota sotto un post.
 */
export default async function RadarPage() {
  const session = await auth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Radar Immobili &amp; Aste</h1>
        <p className="text-sm text-muted-foreground">
          Le opportunità che stai seguendo: aste giudiziarie e ribassi di mercato. Carica la
          perizia e l&apos;assistente ne ricava stato occupazionale, difformità, vincoli e costi di
          sanatoria.
        </p>
      </div>

      <RadarBoard nomeAgenzia={session?.user?.agencyName ?? "la tua agenzia"} />
    </div>
  );
}
