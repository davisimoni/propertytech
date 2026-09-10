"use client";

import { Suspense } from "react";
import { Mic } from "lucide-react";
import { InfoTip } from "@/components/shared/info-tip";
import { ModuleWithHistory } from "@/components/history/module-with-history";
import { VoiceReportStudio } from "@/components/reports/voice-report-studio";

/*
 * "use client": l'empty state passa `icon: Mic` e `onSecondary` (funzioni) a
 * `ModuleWithHistory`, un Client Component. Nessun lavoro server-only c'era
 * prima qui, quindi il passaggio non toglie nulla.
 */
export default function VoiceReportsPage() {
  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="flex items-center gap-1.5 text-xl font-semibold text-foreground">
          Report Venditori (Note Vocali)
          <InfoTip label="Scrivere un report professionale per il proprietario partendo dai propri appunti richiede tempo che di solito si trova la sera, non appena usciti dalla visita. Qui basta la nota a voce: l'AI la trasforma nel report mentre sei già in macchina verso il prossimo appuntamento." />
        </h1>
        <p className="text-sm text-muted-foreground">
          Registra o scrivi la nota post-visita: l&apos;AI genera il report professionale da
          condividere con il proprietario dell&apos;immobile.
        </p>
      </div>

      <ModuleWithHistory
        kind="VOICE_REPORT"
        workLabel="Nuovo report"
        emptyHint="I report post-visita generati restano qui, con il PDF da inviare al proprietario."
        emptyState={{
          icon: Mic,
          title: "Nessun report generato",
          description:
            "Appena esci da una visita, registra o scrivi due righe su come è andata: l'AI le trasforma in un report professionale, pronto da mandare al proprietario.",
          primaryLabel: "Registra la tua prima nota",
          secondaryLabel: "Prova con un esempio",
          /*
           * Navigazione vera, non il router client: VoiceReportStudio legge
           * `?demo=1` solo all'apertura, ed è già montato quando si arriva
           * qui dall'empty state della Cronologia (che lo nasconde, non lo
           * smonta). Una navigazione soffice sulla stessa rotta non lo
           * rimonterebbe, e la nota di esempio non comparirebbe mai.
           */
          onSecondary: () => {
            window.location.href = "/voice-reports?demo=1";
          },
        }}
      >
        {/* VoiceReportStudio legge `?demo=1` dalla query per precompilare una
            nota di esempio: serve un confine Suspense, stesso pattern già in
            uso per PlanGrid in Impostazioni. */}
        <Suspense>
          <VoiceReportStudio />
        </Suspense>
      </ModuleWithHistory>
    </div>
  );
}
