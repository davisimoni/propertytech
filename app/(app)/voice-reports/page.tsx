import { ModuleWithHistory } from "@/components/history/module-with-history";
import { VoiceReportStudio } from "@/components/reports/voice-report-studio";

export default function VoiceReportsPage() {
  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="text-xl font-semibold text-foreground">Report Venditori (Note Vocali)</h1>
        <p className="text-sm text-muted-foreground">
          Registra o scrivi la nota post-visita: l&apos;AI genera il report professionale da
          condividere con il proprietario dell&apos;immobile.
        </p>
      </div>

      <ModuleWithHistory kind="VOICE_REPORT" workLabel="Nuovo report" emptyHint="I report post-visita generati restano qui, con il PDF da inviare al proprietario.">
        <VoiceReportStudio />
      </ModuleWithHistory>
    </div>
  );
}
