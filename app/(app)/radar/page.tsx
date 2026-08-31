import { RadarBoard } from "@/components/radar/radar-board";

export default function RadarPage() {
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

      <RadarBoard />
    </div>
  );
}
